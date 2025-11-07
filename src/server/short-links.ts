import { getDb } from "@/server/firebase-admin";

export type ShortLinkDoc = {
  id: string;       // الكود القصير
  code: string;     // نفس id لسهولة القراءة
  targetUrl: string;
  url?: string;     // للتوافق الخلفي
  createdAt: number;
  lastHitAt?: number | null;
  hits?: number;
  ownerStoreId?: string | null; // Store owner ID for access control
};

const COLL = "short_links";

function genCode(len = 4) {
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
    if (!/^https?:$/.test(x.protocol)) return false;
    if (/\/review\/?$/.test(x.pathname)) return false;
    return true;
  } catch {
    return false;
  }
}

export async function createShortLink(
  targetUrl: string,
  ownerStoreId?: string | null
): Promise<string> {
  const db = getDb();
  if (!isValidTarget(targetUrl)) throw new Error("invalid_target_url");

  let code = genCode(4);
  const ref = db.collection(COLL).doc(code);
  if ((await ref.get()).exists) code = genCode(4);

  const doc: ShortLinkDoc = {
    id: code,
    code,
    targetUrl,
    url: targetUrl,
    createdAt: Date.now(),
    hits: 0,
    lastHitAt: null,
    ownerStoreId: ownerStoreId || null,
  };

  await db.collection(COLL).doc(code).set(doc);

  const base = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || "";
  if (!base) throw new Error("BASE_URL not configured");

  return `${sanitizeBase(base)}/r/${code}`;
}

export async function expandShortLink(code: string): Promise<string | null> {
  const db = getDb();
  const snap = await db.collection(COLL).doc(code).get();
  if (!snap.exists) return null;

  const data = snap.data() as ShortLinkDoc | undefined;
  const dest = (data?.targetUrl || data?.url || "").trim();

  if (!isValidTarget(dest)) return null;

  await snap.ref.set(
    { hits: (data?.hits || 0) + 1, lastHitAt: Date.now() },
    { merge: true }
  );

  return dest;
}
