import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";

function parseHrefBase(raw: unknown): { base: string; host: string } {
  try {
    const u = new URL(String(raw || ""));
    const origin = u.origin.toLowerCase();
    const firstSeg = u.pathname.split("/").filter(Boolean)[0] || "";
    const base = firstSeg && firstSeg.startsWith("dev-") ? `${origin}/${firstSeg}` : origin;
    return { base, host: u.host.toLowerCase() };
  } catch {
    return { base: "", host: "" };
  }
}

function toDomainBase(domain: string | null | undefined): string | null {
  if (!domain) return null;
  try {
    const u = new URL(String(domain));
    const origin = u.origin.toLowerCase();
    const firstSeg = u.pathname.split("/").filter(Boolean)[0] || "";
    return firstSeg && firstSeg.startsWith("dev-") ? `${origin}/${firstSeg}` : origin;
  } catch {
    return null;
  }
}

function encodeUrlForFirestore(url: string | null | undefined): string {
  if (!url) return "";
  // Replace problematic characters with safe alternatives for Firestore document IDs
  return url
    .replace(/:/g, "_COLON_")  // Replace : with _COLON_
    .replace(/\//g, "_SLASH_") // Replace / with _SLASH_
    .replace(/\?/g, "_QUEST_") // Replace ? with _QUEST_
    .replace(/#/g, "_HASH_")   // Replace # with _HASH_
    .replace(/&/g, "_AMP_");   // Replace & with _AMP_
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET")   return res.status(405).json({ error: "method_not_allowed" });

  try {
    const storeUid = typeof req.query.storeUid === "string" ? req.query.storeUid.trim() : "";
    if (storeUid) return res.status(200).json({ storeUid });

    const href = typeof req.query.href === "string" ? req.query.href.trim() : "";
    if (!href) return res.status(400).json({ error: "MISSING_INPUT", hint: "send storeUid or href" });

    const { base, host } = parseHrefBase(href);

    const db = dbAdmin();
    let doc = null;

    if (base) {
      // البحث عبر الدومين فقط - أولاً جرب البحث المباشر
      const snap = await db.collection("stores")
        .where("salla.domain", "==", base)
        .where("salla.connected", "==", true)
        .where("salla.installed", "==", true)
        .limit(1)
        .get();

      if (!snap.empty) {
        doc = snap.docs[0];
      } else {
        // جرب البحث عبر مجموعة domains أولاً (optimized lookup)
        try {
          // Try encoded URL first (new format)
          const encodedBase = encodeUrlForFirestore(base);
          let domainDoc = await db.collection("domains").doc(encodedBase).get();
          
          // If not found, try the original URL as a fallback (backward compatibility)
          if (!domainDoc.exists) {
            try {
              domainDoc = await db.collection("domains").doc(base).get();
            } catch {
              // Ignore errors from invalid document paths (original URLs with slashes)
            }
          }
          
          if (domainDoc && domainDoc.exists) {
            const domainData = domainDoc.data();
            const storeUid = domainData?.storeUid;
            if (storeUid) {
              const storeDoc = await db.collection("stores").doc(storeUid).get();
              if (storeDoc.exists) {
                const storeData = storeDoc.data();
                if (storeData?.["salla.connected"] === true && storeData?.["salla.installed"] === true) {
                  doc = storeDoc;
                }
              }
            }
          }
          
          // جرب أيضاً البحث بالتنسيق المعياري للدومين
          if (!doc) {
            const normalizedBase = toDomainBase(base);
            if (normalizedBase && normalizedBase !== base) {
              // Try encoded normalized URL first (new format)
              const encodedNormalizedBase = encodeUrlForFirestore(normalizedBase);
              let normalizedDomainDoc = await db.collection("domains").doc(encodedNormalizedBase).get();
              
              // If not found, try the original normalized URL as a fallback (backward compatibility)
              if (!normalizedDomainDoc.exists) {
                try {
                  normalizedDomainDoc = await db.collection("domains").doc(normalizedBase).get();
                } catch {
                  // Ignore errors from invalid document paths
                }
              }
              
              if (normalizedDomainDoc && normalizedDomainDoc.exists) {
                const domainData = normalizedDomainDoc.data();
                const storeUid = domainData?.storeUid;
                if (storeUid) {
                  const storeDoc = await db.collection("stores").doc(storeUid).get();
                  if (storeDoc.exists) {
                    const storeData = storeDoc.data();
                    if (storeData?.["salla.connected"] === true && storeData?.["salla.installed"] === true) {
                      doc = storeDoc;
                    }
                  }
                }
              }
            }
          }
        } catch (domainLookupError) {
          console.warn("[resolve] domain lookup failed:", domainLookupError);
        }

        // إذا لم نجد في domains، جرب التنسيقات المختلفة للدومين
        if (!doc) {
          const normalizedBase = toDomainBase(base);
          const domainVariations = [
            base,
            normalizedBase,
            base.replace(/^https?:\/\//, ""),
            base.replace(/^https?:\/\//, "").replace(/^www\./, ""),
            `https://${host}`,
            `http://${host}`,
            host,
            `www.${host}`
          ].filter((v, i, arr) => v && arr.indexOf(v) === i); // إزالة المكرر والقيم الفارغة
          
          for (const variation of domainVariations) {
            const snapVar = await db.collection("stores")
              .where("salla.domain", "==", variation)
              .where("salla.connected", "==", true)
              .where("salla.installed", "==", true)
              .limit(1)
              .get();
            if (!snapVar.empty) {
              doc = snapVar.docs[0];
              break;
            }
          }
        }
      }
    } else {
      // فقط إذا لم يوجد دومين في الرابط، جرب البحث عبر storeId/uid
      const storeId = typeof req.query.storeId === "string" && req.query.storeId.trim()
        ? req.query.storeId.trim()
        : undefined;

      if (!storeId) return res.status(400).json({ error: "INVALID_HREF" });

      // جرب البحث كرقم
      const snapNum = await db.collection("stores")
        .where("salla.storeId", "==", Number(storeId))
        .where("salla.connected", "==", true)
        .where("salla.installed", "==", true)
        .limit(1)
        .get();
      if (!snapNum.empty) {
        doc = snapNum.docs[0];
      } else {
        // جرب البحث كنص
        const snapStr = await db.collection("stores")
          .where("salla.storeId", "==", storeId)
          .where("salla.connected", "==", true)
          .where("salla.installed", "==", true)
          .limit(1)
          .get();
        if (!snapStr.empty) {
          doc = snapStr.docs[0];
        } else {
          // جرب البحث عبر uid
          const snapUid = await db.collection("stores")
            .where("uid", "==", `salla:${storeId}`)
            .where("salla.connected", "==", true)
            .where("salla.installed", "==", true)
            .limit(1)
            .get();
          if (!snapUid.empty) {
            doc = snapUid.docs[0];
          }
        }
      }
    }

    if (!doc) {
      // إضافة معلومات أكثر للتشخيص
      console.warn("[resolve] Store not found:", {
        baseTried: base,
        host: host,
        href: href,
        timestamp: new Date().toISOString()
      });
      
      return res.status(404).json({
        error: "STORE_NOT_FOUND",
        message: "لم يتم العثور على متجر لهذا الدومين أو المعرف. تأكد من أن التطبيق مثبت وأن الدومين أو المعرف مسجل.",
        baseTried: base,
        hostTried: host,
        debug: {
          parsedBase: base,
          parsedHost: host,
          originalHref: href
        }
      });
    }

    const data = doc.data() as { storeUid?: string; uid?: string; salla?: { uid?: string; storeId?: string } };
    const resolvedUid =
      data.storeUid ||
      data.uid ||
      data.salla?.uid ||
      (data.salla?.storeId ? `salla:${data.salla.storeId}` : undefined);

    if (!resolvedUid) {
      return res.status(404).json({ error: "UID_NOT_FOUND_FOR_DOMAIN", baseTried: base });
    }
    
    // إضافة معلومات نجاح للتشخيص
    console.log("[resolve] Store resolved successfully:", {
      resolvedUid,
      baseTried: base,
      host: host,
      timestamp: new Date().toISOString()
    });
    
    return res.status(200).json({ storeUid: resolvedUid });
  } catch (e) {
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
    console.error("[resolve] unexpected", typeof e === "object" && e && "message" in e ? (e as any).message : e);
    return res.status(500).json({ error: "RESOLVE_FAILED" });
  }
}