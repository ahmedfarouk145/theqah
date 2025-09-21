import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";

function parseHrefBase(raw: unknown): { base: string; host: string; devStoreId?: string; identifier?: string } {
  try {
    const u = new URL(String(raw || ""));
    const origin = u.origin.toLowerCase();
    const firstSeg = u.pathname.split("/").filter(Boolean)[0] || "";
    const base = firstSeg && firstSeg.startsWith("dev-") ? `${origin}/${firstSeg}` : origin;
    const devMatch = firstSeg.match(/^dev-(\w+)$/);
    const devStoreId = devMatch ? devMatch[1] : undefined;
    const identifier = u.searchParams.get("identifier") || undefined;
    return { base, host: u.host.toLowerCase(), devStoreId, identifier };
  } catch {
    return { base: "", host: "", devStoreId: undefined, identifier: undefined };
  }
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

    const { base, host, devStoreId, identifier } = parseHrefBase(href);

    const db = dbAdmin();
    let doc = null;

    // جرب البحث عبر الدومين أولاً
    if (base) {
      const snap = await db.collection("stores")
        .where("salla.domain", "==", base)
        .where("salla.connected", "==", true)
        .where("salla.installed", "==", true)
        .limit(1)
        .get();

      if (!snap.empty) {
        doc = snap.docs[0];
      } else {
        // جرب بعض التنسيقات الأخرى للدومين
        const domainVariations = [
          base,
          base.replace(/^https?:\/\//, ""),
          base.replace(/^https?:\/\//, "").replace(/^www\./, ""),
          `https://${host}`,
          `http://${host}`,
          host,
          `www.${host}`
        ];
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

    // إذا لم نجد متجرًا عبر الدومين، جرب البحث عبر storeId أو uid
    if (!doc) {
      // أولوية استخراج storeId: من الكويري مباشرة ثم من identifier ثم من dev-xxxxxx
      const storeId = typeof req.query.storeId === "string" && req.query.storeId.trim()
        ? req.query.storeId.trim()
        : identifier || devStoreId;

      if (storeId) {
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
    }

    if (!doc) {
      return res.status(404).json({
        error: "STORE_NOT_FOUND",
        message: "لم يتم العثور على متجر لهذا الدومين أو المعرف. تأكد من أن التطبيق مثبت وأن الدومين أو المعرف مسجل.",
        baseTried: base
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
    return res.status(200).json({ storeUid: resolvedUid });
  } catch (e) {
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
    console.error("[resolve] unexpected", typeof e === "object" && e && "message" in e ? (e as any).message : e);
    return res.status(500).json({ error: "RESOLVE_FAILED" });
  }
}