// src/pages/api/public/reviews/resolve.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";

type Res = { storeUid: string } | { error: string };

const normHost = (raw: string) =>
  raw.trim().toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];

const tryOnce = async (host: string) => {
  const db = dbAdmin();

  // 1) لو فيه domains أو primaryDomain (لو موجودين لاحقًا)
  let snap = await db.collection("stores")
    .where("domains", "array-contains", host)
    .limit(1).get();
  if (!snap.empty) return snap.docs[0];

  snap = await db.collection("stores")
    .where("primaryDomain", "==", host)
    .limit(1).get();
  if (!snap.empty) return snap.docs[0];

  // 2) direct equality على domain لو متخزّن بدون بروتوكول (احتياط)
  snap = await db.collection("stores")
    .where("domain", "==", host)
    .limit(1).get();
  if (!snap.empty) return snap.docs[0];

  // 3) prefix search على الحقل الحالي domain (رابط كامل)
  const variants = [
    `https://${host}`,
    `http://${host}`,
    `https://www.${host}`,
    `http://www.${host}`,
  ];

  for (const start of variants) {
    const end = start + "\uf8ff";
    const q = await db.collection("stores")
      .where("domain", ">=", start)
      .where("domain", "<=", end)
      .limit(1).get();
    if (!q.empty) return q.docs[0];
  }

  return null;
};

// كاش بسيط في الذاكرة يقلّل قراءات فايرستور
const cache = new Map<string, { uid: string; t: number }>();
const TTL = 5 * 60 * 1000; // 5 دقائق

export default async function handler(req: NextApiRequest, res: NextApiResponse<Res>) {
  // CORS / preflight
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).end();
  }
  if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  const storeUid = String(req.query.storeUid || "").trim();
  const storeId = String(req.query.storeId || req.query.store || "").trim();
  if (storeUid) return res.status(200).json({ storeUid });
  if (storeId) return res.status(200).json({ storeUid: `salla:${storeId}` });

  const rawHost = String(req.query.host || "");
  const host = normHost(rawHost);
  if (!host) return res.status(400).json({ error: "MISSING_HOST" });

  // كاش
  const now = Date.now();
  const cached = cache.get(host);
  if (cached && now - cached.t < TTL) {
    return res.status(200).json({ storeUid: cached.uid });
  }

  try {
    const doc = await tryOnce(host);
    if (!doc) return res.status(404).json({ error: "STORE_NOT_FOUND" });
//eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = doc.data() as any;
    const uid = data.uid || data.storeUid || (data.storeId ? `salla:${data.storeId}` : null);
    if (!uid) return res.status(404).json({ error: "UID_NOT_FOUND" });

    cache.set(host, { uid, t: now });
    return res.status(200).json({ storeUid: uid });
  } catch (e) {
    return res.status(500).json({ error: "RESOLVE_FAILED" });
  }
}
