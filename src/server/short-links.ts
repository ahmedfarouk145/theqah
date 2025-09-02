// src/server/short-links.ts
import { getDb } from "@/server/firebase-admin";

export type ShortLinkDoc = {
  id: string;              // الكود القصير
  code: string;            // نفس id لسهولة القراءة
  targetUrl: string;       // الرابط النهائي (الموصى به)
  url?: string;            // للتوافق الخلفي
  createdAt: number;
  lastHitAt?: number | null;
  hits?: number;
};

const COLL = "short_links";

// مولّد كود 8 حروف [a-z0-9]
function genCode(len = 8) {
  return Math.random().toString(36).slice(2, 2 + len);
}

function sanitizeBase(url: string) {
  return url.replace(/\/+$/, "");
}

function isValidTarget(u: string) {
  if (!u) return false;
  if (/undefined/i.test(u)) return false;
  try {
    const x = new URL(u);
    // لازم http/https فقط
    if (!/^https?:$/.test(x.protocol)) return false;
    // ما يبقاش /review/ بس من غير توكن
    if (/\/review\/?$/.test(x.pathname)) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * أنشئ رابط مختصر يعيد التوجيه إلى `targetUrl`
 * يرجّع /r/<code>
 */
export async function createShortLink(targetUrl: string): Promise<string> {
  const db = getDb();

  // تحقّق قوي قبل التخزين
  if (!isValidTarget(targetUrl)) {
    throw new Error("invalid_target_url");
  }

  // ولّد كود فريد (جرّب مرّة أو اتنين لتجنّب الاصطدام)
  let code = genCode(8);
  const ref = db.collection(COLL).doc(code);
  const snap = await ref.get();
  if (snap.exists) {
    code = genCode(8);
  }

  const doc: ShortLinkDoc = {
    id: code,
    code,
    targetUrl,
    url: targetUrl,         // للتوافق مع أي كود قديم يعتمد على 'url'
    createdAt: Date.now(),
    hits: 0,
    lastHitAt: null,
  };

  await db.collection(COLL).doc(code).set(doc);

  const base =
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    "";

  if (!base) {
    // نسمح بإنشاء الدوكيومنت حتى لو الـ BASE فاضي، لكن نوقف الرابط الراجع
    throw new Error("BASE_URL not configured");
  }

  return `${sanitizeBase(base)}/r/${code}`;
}

/**
 * يعيد الوجهة النهائية أو null لو غير موجود/غير صالح
 * ويحدّث العداد ووقت آخر زيارة
 */
export async function expandShortLink(code: string): Promise<string | null> {
  const db = getDb();
  const snap = await db.collection(COLL).doc(code).get();
  if (!snap.exists) return null;

  const data = snap.data() as ShortLinkDoc | undefined;
  const dest = (data?.targetUrl || data?.url || "").trim();

  if (!isValidTarget(dest)) {
    // ما نرجّعش لينك بايظ
    return null;
  }

  // زيادات آمنة
  const hits = (data?.hits || 0) + 1;
  await snap.ref.set({ hits, lastHitAt: Date.now() }, { merge: true });

  return dest;
}
