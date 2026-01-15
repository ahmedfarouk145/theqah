// src/pages/api/salla/refresh.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { getDb } from "@/server/firebase-admin";

/**
 * ENV:
 *  - SALLA_TOKEN_URL
 *  - SALLA_CLIENT_ID
 *  - SALLA_CLIENT_SECRET
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });
  try {
    const uid = (req.query.uid as string) || (req.body?.uid as string);
    if (!uid) return res.status(400).json({ error: "missing_uid" });

    const db = getDb();
    const doc = await db.collection("stores").doc(uid).get();
    const refresh = doc.data()?.salla?.tokens?.refresh_token as string | undefined;
    if (!refresh) return res.status(400).json({ error: "no_refresh_token" });

    const tokenUrl = process.env.SALLA_TOKEN_URL!;
    const clientId = process.env.SALLA_CLIENT_ID!;
    const clientSec = process.env.SALLA_CLIENT_SECRET!;
    if (!tokenUrl || !clientId || !clientSec) {
      return res.status(500).json({ error: "missing_env" });
    }

    const resp = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refresh,
        client_id: clientId,
        client_secret: clientSec,
      }).toString(),
    });

    const data = await resp.json();
    if (!resp.ok) {
      return res.status(resp.status).json({ error: "refresh_failed", details: data });
    }

    const access = String(data.access_token || "");
    const newRef = (data.refresh_token as string) || refresh;
    const expiresIn = Number(data.expires_in || 0);
    const expiresAt = expiresIn ? Date.now() + expiresIn * 1000 : null;

    await doc.ref.set(
      {
        salla: {
          connected: true,
          tokens: {
            access_token: access,
            refresh_token: newRef,
            expires_at: expiresAt,
            obtained_at: Date.now(),
          },
        },
      },
      { merge: true }
    );

    res.status(200).json({ ok: true, expiresAt });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: "internal", message });
  }
}
