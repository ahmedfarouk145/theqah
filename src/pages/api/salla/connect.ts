// src/pages/api/salla/connect.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { getAuthAdmin } from "@/server/firebase-admin";

/**
 * ENV:
 *  - SALLA_CLIENT_ID
 *  - SALLA_AUTHORIZE_URL (مثل: https://accounts.salla.dev/oauth2/authorize)
 *  - APP_BASE_URL (https://www.theqah.com.sa)
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const clientId = process.env.SALLA_CLIENT_ID!;
    const authUrl = process.env.SALLA_AUTHORIZE_URL!;
    const appBase = process.env.APP_BASE_URL!;
    if (!clientId || !authUrl || !appBase) {
      return res.status(500).json({ error: "missing_env" });
    }

    // استخرج uid من header أو من query
    let uid: string | null = (req.query.storeUid as string) || null;
    if (!uid) {
      const idToken = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
      if (idToken) {
        const decoded = await getAuthAdmin().verifyIdToken(idToken).catch(() => null);
        uid = decoded?.uid || null;
      }
    }
    if (!uid) return res.status(401).json({ error: "no_store_uid" });

    const redirectUri = `${appBase}/api/salla/callback`;
    const scope = encodeURIComponent("read write");
    const state = encodeURIComponent(JSON.stringify({ uid }));

    const url =
      `${authUrl}?response_type=code&client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${scope}&state=${state}`;

    res.status(302).setHeader("Location", url).end();
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: "internal", message });
  }
}
