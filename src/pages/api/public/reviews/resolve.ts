// src/pages/api/admin/resolve.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";

/* ===================== Utils ===================== */

function normalizeUrl(raw: unknown): URL | null {
  const s = String(raw || "").trim();
  if (!s) return null;
  // أضف بروتوكول لو ناقص
  const withProto = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    return new URL(withProto);
  } catch {
    return null;
  }
}

/** يستخرج:
 *  - base: لو Trial => origin/dev-xxxx ، غير كده => origin
 *  - host: بدون بروتوكول
 *  - isTrial: أول سيجمنت يبدأ بـ dev-
 */
function parseHrefBase(raw: unknown): { base: string; host: string; isTrial: boolean } {
  const u = normalizeUrl(raw);
  if (!u) return { base: "", host: "", isTrial: false };

  const origin = u.origin.toLowerCase();
  const firstSeg = u.pathname.split("/").filter(Boolean)[0] || "";
  const isTrial = firstSeg.startsWith("dev-");

  const base = isTrial ? `${origin}/${firstSeg}` : origin;
  return { base, host: u.host.toLowerCase(), isTrial };
}

/** تطبيع دومين إلى base:
 *  - لو Trial => origin/dev-xxxx
 *  - غير كده => origin
 */
function toDomainBase(domain: string | null | undefined): string | null {
  if (!domain) return null;
  const u = normalizeUrl(domain);
  if (!u) return null;

  const origin = u.origin.toLowerCase();
  const firstSeg = u.pathname.split("/").filter(Boolean)[0] || "";
  return firstSeg.startsWith("dev-") ? `${origin}/${firstSeg}` : origin;
}

/** ترميز URL للاستخدام كـ document id آمن في Firestore */
function encodeUrlForFirestore(url: string | null | undefined): string {
  if (!url) return "";
  return url
    .replace(/:/g, "_COLON_")
    .replace(/\//g, "_SLASH_")
    .replace(/\?/g, "_QUEST_")
    .replace(/#/g, "_HASH_")
    .replace(/&/g, "_AMP_");
}

/* ===================== Handler ===================== */

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // CORS + Caching
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });

  try {
    const storeUidParam = typeof req.query.storeUid === "string" ? req.query.storeUid.trim() : "";
    if (storeUidParam) {
      // لو جالك storeUid جاهز رجّعه كما هو (سلوكك السابق)
      return res.status(200).json({ storeUid: storeUidParam });
    }

    const href = typeof req.query.href === "string" ? req.query.href.trim() : "";
    if (!href) return res.status(400).json({ error: "MISSING_INPUT", hint: "send storeUid or href" });

    const { base, host, isTrial } = parseHrefBase(href);

    const db = dbAdmin();
    let doc: FirebaseFirestore.DocumentSnapshot | null = null;

    if (base) {
      // (1) محاولة مباشرة على stores بالسطر الواحد (base كما هو)
      const directSnap = await db
        .collection("stores")
        .where("salla.domain", "==", base)
        .where("salla.connected", "==", true)
        .where("salla.installed", "==", true)
        .limit(1)
        .get();

      if (!directSnap.empty) {
        doc = directSnap.docs[0];
      }

      // (2) lookup عبر مجموعة domains (id = encoded base) ثم fallback إلى base نفسه
      if (!doc) {
        try {
          const encodedBase = encodeUrlForFirestore(base);
          let domainDoc = await db.collection("domains").doc(encodedBase).get();

          if (!domainDoc.exists) {
            try {
              domainDoc = await db.collection("domains").doc(base).get();
            } catch {
              // تجاهل أخطاء المسارات غير الصالحة (لو كان base فيه '/')
            }
          }

          if (domainDoc.exists) {
            const domainData = domainDoc.data() as { storeUid?: string };
            const fromDomainUid = domainData?.storeUid;
            if (fromDomainUid) {
              const storeDoc = await db.collection("stores").doc(fromDomainUid).get();
              if (storeDoc.exists) {
                const s = storeDoc.data() as Record<string, unknown>;
                if (s?.["salla.connected"] === true && s?.["salla.installed"] === true) {
                  doc = storeDoc;
                }
              }
            }
          }

          // (2b) جرّب normalizedBase لو مختلف عن base
          if (!doc) {
            const normalizedBase = toDomainBase(base);
            if (normalizedBase && normalizedBase !== base) {
              const encNorm = encodeUrlForFirestore(normalizedBase);
              let normDoc = await db.collection("domains").doc(encNorm).get();

              if (!normDoc.exists) {
                try {
                  normDoc = await db.collection("domains").doc(normalizedBase).get();
                } catch {
                  // تجاهل أخطاء المسارات
                }
              }

              if (normDoc.exists) {
                const d = normDoc.data() as { storeUid?: string };
                if (d?.storeUid) {
                  const storeDoc = await db.collection("stores").doc(d.storeUid).get();
                  if (storeDoc.exists) {
                    const s = storeDoc.data() as Record<string, unknown>;
                    if (s?.["salla.connected"] === true && s?.["salla.installed"] === true) {
                      doc = storeDoc;
                    }
                  }
                }
              }
            }
          }
        } catch (e) {
          console.warn("[resolve] domain lookup failed:", e);
        }
      }

      // (3) تنويعات الدومين — تُجرَّب فقط لو **مش متجر تجريبي**
      if (!doc && !isTrial) {
        const normalizedBase = toDomainBase(base);
        const variations = [
          base,
          normalizedBase,
          base.replace(/^https?:\/\//i, ""),
          base.replace(/^https?:\/\//i, "").replace(/^www\./i, ""),
          `https://${host}`,
          `http://${host}`,
          host,
          `www.${host}`,
        ].filter((v, i, arr) => v && arr.indexOf(v) === i);

        for (const v of variations) {
          const snapVar = await db
            .collection("stores")
            .where("salla.domain", "==", v)
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
    } else {
      // (4) fallback بالـ storeId/uid لو مفيش base
      const storeId = typeof req.query.storeId === "string" && req.query.storeId.trim()
        ? req.query.storeId.trim()
        : undefined;

      if (!storeId) return res.status(400).json({ error: "INVALID_HREF" });

      const snapNum = await db
        .collection("stores")
        .where("salla.storeId", "==", Number(storeId))
        .where("salla.connected", "==", true)
        .where("salla.installed", "==", true)
        .limit(1)
        .get();

      if (!snapNum.empty) {
        doc = snapNum.docs[0];
      } else {
        const snapStr = await db
          .collection("stores")
          .where("salla.storeId", "==", storeId)
          .where("salla.connected", "==", true)
          .where("salla.installed", "==", true)
          .limit(1)
          .get();

        if (!snapStr.empty) {
          doc = snapStr.docs[0];
        } else {
          const snapUid = await db
            .collection("stores")
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
      console.warn("[resolve] Store not found:", {
        baseTried: base,
        host,
        href,
        timestamp: new Date().toISOString(),
      });

      return res.status(404).json({
        error: "STORE_NOT_FOUND",
        message: "لم يتم العثور على متجر لهذا الدومين أو المعرف. تأكد من أن التطبيق مثبت وأن الدومين أو المعرف مسجل.",
        baseTried: base,
        hostTried: host,
        debug: {
          parsedBase: base,
          parsedHost: host,
          originalHref: href,
        },
      });
    }

    const data = doc.data() as {
      storeUid?: string;
      uid?: string;
      salla?: { uid?: string; storeId?: string | number };
    };

    const resolvedUid =
      data.storeUid ||
      data.uid ||
      data.salla?.uid ||
      (data.salla?.storeId ? `salla:${data.salla.storeId}` : undefined);

    if (!resolvedUid) {
      return res.status(404).json({ error: "UID_NOT_FOUND_FOR_DOMAIN", baseTried: base });
    }

    console.log("[resolve] Store resolved successfully:", {
      resolvedUid,
      baseTried: base,
      host,
      timestamp: new Date().toISOString(),
    });

    return res.status(200).json({ storeUid: resolvedUid });
  } catch (e) {
  
    console.error(
      "[resolve] unexpected",
      //eslint-disable-next-line @typescript-eslint/no-explicit-any
      typeof e === "object" && e && "message" in (e as any) ? (e as any).message : e
    );
    return res.status(500).json({ error: "RESOLVE_FAILED" });
  }
}
