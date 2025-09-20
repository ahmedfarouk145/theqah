// src/pages/api/public/reviews/resolve.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";

type StoreDoc = {
  uid?: string;
  storeUid?: string;
  storeId?: number | string;
  salla?: {
    uid?: string;
    storeId?: number | string;
    domain?: string;        // مثال: https://demostore.salla.sa/dev-xxxxxx
    connected?: boolean;
    installed?: boolean;
  };
};

// كاش اختياري لتقليل قراءات Firestore
type CacheVal = { uid: string; t: number };
//eslint-disable-next-line @typescript-eslint/no-explicit-any
const g: any = global as any;
//eslint-disable-next-line @typescript-eslint/no-explicit-any
const MEM: Map<string, CacheVal> = g.__THEQAH_RESOLVE_MEM__ || new Map();
g.__THEQAH_RESOLVE_MEM__ = MEM;
const TTL = 10 * 60 * 1000; // 10 دقائق
function cacheGet(k: string) {
  const v = MEM.get(k);
  if (v && Date.now() - v.t < TTL) return v.uid;
  if (v) MEM.delete(k);
  return null;
}
function cacheSet(k: string, uid: string) {
  MEM.set(k, { uid, t: Date.now() });
}

// نطبع الدومين بإزالة الـ trailing slash فقط (ونمنع أي lowercase أو تعديل للمسار)
function normalizeDomainInput(raw: string) {
  let s = raw.trim();
  // لازم يكون شكل URL كامل ببروتوكول
  if (!/^https?:\/\//.test(s)) return null;
  // إزالة سلاش أخير فقط
  s = s.replace(/\/+$/, "");
  return s;
}

// نتأكد أن شكل الدومين فيه مسار dev-xxxxx (لأن بدايات الدومينات متشابهة)
function looksLikeDevDomain(url: string) {
  try {
    const u = new URL(url);
    const firstSeg = u.pathname.split("/").filter(Boolean)[0] || "";
    return firstSeg.startsWith("dev-");
  } catch {
    return false;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // CORS للودجت
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");

  // كاش 5 دقائق (يناسب إن الـ mapping ثابت تقريبًا)
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });

  try {
    // مدخلين فقط:
    // 1) storeUid الكامل (مثال: salla:982747175)
    // 2) domain الكامل (مثال: https://demostore.salla.sa/dev-6pvf7vguhv84lfoi)
    const storeUidRaw = typeof req.query.storeUid === "string" ? req.query.storeUid.trim() : "";
    const domainRaw   = typeof req.query.domain   === "string" ? req.query.domain.trim()   : "";

    // 1) لو storeUid موجود → رجّعه مباشرة
    if (storeUidRaw) {
      cacheSet(`uid:${storeUidRaw}`, storeUidRaw);
      return res.status(200).json({ storeUid: storeUidRaw });
    }

    // 2) لازم domain كامل
    if (!domainRaw) {
      return res.status(400).json({ error: "MISSING_DOMAIN_OR_UID" });
    }

    const domain = normalizeDomainInput(domainRaw);
    if (!domain) {
      return res.status(400).json({ error: "INVALID_DOMAIN_FORMAT", hint: "must start with http(s):// and be a full URL" });
    }

    // لو البدايات متشابهة، نلزم وجود مسار dev-xxxxx لتجنّب التضارب
    if (!looksLikeDevDomain(domain)) {
      return res.status(400).json({
        error: "DOMAIN_TOO_GENERIC",
        hint: "send the full domain including /dev-xxxxx to avoid collisions",
      });
    }

    const hit = cacheGet(`dom:${domain}`);
    if (hit) return res.status(200).json({ storeUid: hit });

    const db = dbAdmin();

    // مطابقة صارمة على salla.domain + يكون المتجر متصل ومثبت
    const snap = await db.collection("stores")
      .where("salla.connected", "==", true)
      .where("salla.installed", "==", true)
      .where("salla.domain", "==", domain) // مساواة حرفيًا
      .limit(1)
      .get();

    if (snap.empty) {
      return res.status(404).json({ error: "STORE_NOT_FOUND", domain });
    }

    const data = snap.docs[0].data() as StoreDoc;
    const uid =
      data.uid ||
      data.storeUid ||
      data.salla?.uid ||
      (data.salla?.storeId ? `salla:${data.salla.storeId}` : undefined) ||
      (data.storeId != null ? `salla:${String(data.storeId)}` : undefined);

    if (!uid) {
      return res.status(404).json({ error: "UID_NOT_FOUND_FOR_STORE", domain });
    }

    cacheSet(`dom:${domain}`, uid);
    return res.status(200).json({ storeUid: uid });
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    console.error("resolve_error", e?.message || e);
    return res.status(500).json({ error: "RESOLVE_FAILED" });
  }
}
