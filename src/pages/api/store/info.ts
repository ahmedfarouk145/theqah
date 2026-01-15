// src/pages/api/store/info.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { authAdmin } from "@/lib/firebaseAdmin";
import { StoreService, type StoreInfo } from "@/server/services/store.service";

type Ok = { ok: true; store: StoreInfo };
type Err = { ok: false; error: string };

async function verify(req: NextApiRequest) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer (.+)$/i);
  const token = m?.[1];
  if (!token) return null;
  try {
    const dec = await authAdmin().verifyIdToken(token);
    return { uid: dec.uid as string, email: (dec.email ?? null) as string | null };
  } catch { return null; }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<Ok | Err>) {
  try {
    const uidParam = typeof req.query.uid === "string" ? req.query.uid : undefined;

    // 1) Priority: uid in query
    let idToRead: string | null = uidParam || null;

    // 2) Otherwise use user's uid
    if (!idToRead) {
      const user = await verify(req);
      if (!user) return res.status(401).json({ ok: false, error: "UNAUTHENTICATED" });
      idToRead = user.uid;
    }

    if (!idToRead) return res.status(400).json({ ok: false, error: "Missing uid" });

    const storeService = new StoreService();
    const storeInfo = await storeService.getStoreInfo(idToRead);

    if (!storeInfo) {
      return res.status(404).json({ ok: false, error: "Store not found" });
    }

    return res.status(200).json({ ok: true, store: storeInfo });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
}
