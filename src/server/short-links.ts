// src/server/short-links.ts
import { getDb } from "@/server/firebase-admin";

export type ShortLinkDoc = {
  id: string;              // كود قصير
  url: string;             // الرابط الأصلي
  createdAt: number;
  lastHitAt?: number | null;
  hits?: number;
};

const COLL = "short_links";

export async function createShortLink(url: string): Promise<string> {
  const db = getDb();
  const id = db.collection(COLL).doc().id.slice(0, 8); // كود قصير
  const doc: ShortLinkDoc = { id, url, createdAt: Date.now(), hits: 0, lastHitAt: null };
  await db.collection(COLL).doc(id).set(doc);

  const base = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || "";
  return `${base}/r/${id}`; // ← توحيد على /r/<id>
}

export async function expandShortLink(id: string): Promise<string | null> {
  const db = getDb();
  const snap = await db.collection(COLL).doc(id).get();
  if (!snap.exists) return null;
  const data = snap.data() as ShortLinkDoc;
  await snap.ref.update({
    hits: (data.hits || 0) + 1,
    lastHitAt: Date.now(),
  });
  return data.url;
}
