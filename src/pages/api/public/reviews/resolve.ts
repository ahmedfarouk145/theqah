// src/pages/api/public/reviews/resolve.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";

/**
 * يعمل resolve فقط بطريقتين:
 *  1) storeUid=...  => يرجّع نفس الـ UID فورًا
 *  2) href=...      => يستخرج base (origin + dev-...) ويعمل مساواة مباشرة مع stores.salla.domain
 *
 * لا يوجد مسح شامل لكل المتاجر. إمّا مساواة مباشرة أو UID مباشر.
 */

type StoreDoc = {
  uid?: string;
  storeUid?: string;
  storeId?: number | string;
  salla?: {
    uid?: string;
    storeId?: number | string;
    domain?: string;        // مثل: https://demostore.salla.sa/dev-xxxxx
    connected?: boolean;
    installed?: boolean;
  };
};

function parseHrefBase(raw: unknown): { host: string; origin: string; base: string; href: string } {
  const out = { host: "", origin: "", base: "", href: "" };
  try {
    const u = new URL(String(raw || ""));
    out.host = u.host.replace(/^www\./, "").toLowerCase();
    out.origin = u.origin.toLowerCase();
    const firstSeg = u.pathname.split("/").filter(Boolean)[0] || "";
    // سلة dev-... ⇒ نعتبرها جزء من base
    out.base = firstSeg && firstSeg.startsWith("dev-") ? `${out.origin}/${firstSeg}` : out.origin;
    out.href = u.href.toLowerCase();
  } catch {
    // invalid URL
  }
  return out;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // CORS الخفيف للودجت
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });

  try {
    const storeUid = typeof req.query.storeUid === "string" ? req.query.storeUid.trim() : "";
    const href = typeof req.query.href === "string" ? req.query.href.trim() : "";

    // 1) storeUid مباشرة
    if (storeUid) {
      return res.status(200).json({ storeUid });
    }

    // 2) href مطلوب لو مفيش storeUid
    if (!href) {
      return res.status(400).json({ error: "MISSING_INPUT", hint: "send storeUid or href" });
    }

    const { base } = parseHrefBase(href);
    if (!base) {
      return res.status(400).json({ error: "INVALID_HREF", hint: "must be full URL to the storefront page" });
    }

    // مساواة مباشرة على salla.domain
    const db = dbAdmin();
    const snap = await db.collection("stores")
      .where("platform", "==", "salla")
      .where("salla.connected", "==", true)
      .where("salla.installed", "==", true)
      .where("salla.domain", "==", base)
      .limit(1)
      .get();

    if (snap.empty) {
      // رسالة واضحة بالعربي
      return res.status(404).json({
        error: "STORE_NOT_FOUND",
        message: "لم يتم العثور على معرف المتجر. تأكد من تثبيت التطبيق في متجر سلة، وأن salla.domain يطابق الـ href.",
        baseTried: base
      });
    }

    const data = snap.docs[0].data() as StoreDoc;
    const uid =
      data.uid ||
      data.storeUid ||
      data.salla?.uid ||
      (data.salla?.storeId ? `salla:${data.salla.storeId}` : undefined);

    if (!uid) {
      return res.status(404).json({ error: "UID_NOT_FOUND_FOR_STORE", baseTried: base });
    }

    return res.status(200).json({ storeUid: uid });
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    console.error("[resolve] unexpected", e?.message || e);
    return res.status(500).json({ error: "RESOLVE_FAILED" });
  }
}
