import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";

const REDACT = (s?: string | null) =>
  !s ? null : s.length <= 12 ? `${s.length}ch:${s}` : `${s.length}ch:${s.slice(0,6)}…${s.slice(-6)}`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const uid = typeof req.query.uid === "string" ? req.query.uid : null;
    if (!uid) return res.status(400).json({ error: "missing uid" });

    const db = dbAdmin();
    const tok = await db.collection("salla_tokens").doc(uid).get();
    const store = await db.collection("stores").doc(uid).get();

    const t = tok.exists ? tok.data() || {} : {};
    const s = store.exists ? store.data() || {} : {};

    return res.json({
      ok: true,
      uid,
      tokens: {
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
        access_token: REDACT((t as any).accessToken),
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
        refresh_token: REDACT((t as any).refreshToken),
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
        expiresAt: (t as any).expiresAt || null,
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
        obtainedAt: (t as any).obtainedAt || null,
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
        scope: (t as any).scope || null,
      },
      store: {
        /*eslint-disable-next-line @typescript-eslint/no-explicit-any*/
        platform: (s as any).platform || null,
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
        connected: !!(s as any)?.salla?.connected,
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
        installed: !!(s as any)?.salla?.installed,
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
        connectedAt: (s as any).connectedAt || null,
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
        updatedAt: (s as any).updatedAt || null,
      },
      
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
}
