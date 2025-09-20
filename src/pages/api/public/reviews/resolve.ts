import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";

/**
 * lookup strategy:
 *   - if storeUid provided → return it as-is
 *   - else try to extract storeId from query or href (dev-xxxxxx or identifier param)
 *   - search in stores by salla.domain, then by salla.storeId, then by uid
 */

function parseHrefBase(raw: unknown): { base: string; host: string; devStoreId?: string; identifier?: string } {
  try {
    const u = new URL(String(raw || ""));
    const origin = u.origin.toLowerCase();
    const firstSeg = u.pathname.split("/").filter(Boolean)[0] || "";
    const base = firstSeg && firstSeg.startsWith("dev-") ? `${origin}/${firstSeg}` : origin;
    // استخراج storeId من dev-xxxxxx إن وجد
    const devMatch = firstSeg.match(/^dev-(\w+)$/);
    const devStoreId = devMatch ? devMatch[1] : undefined;
    // استخراج identifier من الكويري باراميتر
    const identifier = u.searchParams.get("identifier") || undefined;
    return { base, host: u.host.toLowerCase(), devStoreId, identifier };
  } catch {
    return { base: "", host: "", devStoreId: undefined, identifier: undefined };
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // CORS للودجت
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

    // أولوية استخراج storeId: من الكويري مباشرة ثم من identifier ثم من dev-xxxxxx
    const storeId = typeof req.query.storeId === "string" && req.query.storeId.trim()
      ? req.query.storeId.trim()
      : identifier || devStoreId;

    if (!base && !storeId) return res.status(400).json({ error: "INVALID_HREF" });

    const db = dbAdmin();

    // البحث في stores حسب salla.domain
    let doc = null;
    if (base) {
      //eslint-disable-next-line
      let snap = await db.collection("stores")
        .where("salla.domain", "==", base)
        .where("salla.connected", "==", true)
        .where("salla.installed", "==", true)
        .limit(1)
        .get();

      if (!snap.empty) {
        doc = snap.docs[0];
      } else {
        // جرب البحث بدون dev- أو www أو http/https
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
          const snap = await db.collection("stores")
            .where("salla.domain", "==", variation)
            .where("salla.connected", "==", true)
            .where("salla.installed", "==", true)
            .limit(1)
            .get();
          if (!snap.empty) {
            doc = snap.docs[0];
            break;
          }
        }
      }
    }

    // إذا لم نجد متجرًا عبر الدومين، جرب البحث عبر storeId (رقم أو نص)
    if (!doc && storeId) {
      const snap = await db.collection("stores")
        .where("salla.storeId", "==", Number(storeId))
        .where("salla.connected", "==", true)
        .where("salla.installed", "==", true)
        .limit(1)
        .get();
      if (!snap.empty) {
        doc = snap.docs[0];
      } else {
        // جرب البحث إذا كان storeId نص وليس رقم
        const snap = await db.collection("stores")
          .where("salla.storeId", "==", storeId)
          .where("salla.connected", "==", true)
          .where("salla.installed", "==", true)
          .limit(1)
          .get();
        if (!snap.empty) {
          doc = snap.docs[0];
        }
      }
    }

    // إذا لم نجد متجرًا عبر storeId، جرب البحث عبر uid
    if (!doc && storeId) {
      //eslint-disable-next-line
      let snap = await db.collection("stores")
        .where("uid", "==", `salla:${storeId}`)
        .where("salla.connected", "==", true)
        .where("salla.installed", "==", true)
        .limit(1)
        .get();
      if (!snap.empty) {
        doc = snap.docs[0];
      }
    }

    if (!doc) {
      return res.status(404).json({
        error: "STORE_NOT_FOUND",
        message: "لم يتم العثور على متجر لهذا الدومين أو المعرف. تأكد من أن التطبيق مثبت وأن الدومين أو المعرف مسجل.",
        baseTried: base,
        storeIdTried: storeId
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