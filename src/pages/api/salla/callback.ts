// src/pages/api/salla/callback.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { getDb } from "@/server/firebase-admin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { code, state } = req.query as { code?: string; state?: string };
    if (!code) return res.status(400).send("Missing code");

    const tokenUrl = process.env.SALLA_TOKEN_URL!;
    const clientId = process.env.SALLA_CLIENT_ID!;
    const clientSecret = process.env.SALLA_CLIENT_SECRET!;
    const appBase = process.env.APP_BASE_URL!;
    const redirectUri = `${appBase}/api/salla/callback`;

    let uid: string | null = null;
    if (state) {
      try {
        const parsed = JSON.parse(decodeURIComponent(state));
        uid = parsed?.uid || null;
      } catch {/* ignore */}
    }
    if (!uid) return res.status(400).send("Missing uid in state");

    const resp = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }).toString(),
    });
    const data = await resp.json();

    if (!resp.ok) return res.status(resp.status).send(`Token exchange failed: ${JSON.stringify(data)}`);

    const access = String(data.access_token || "");
    const refresh = (data.refresh_token as string) || null;
    const expiresIn = Number(data.expires_in || 0);
    const expiresAt = expiresIn ? Date.now() + expiresIn * 1000 : null;

    const db = getDb();
    await db.collection("stores").doc(uid).set(
      {
        salla: {
          connected: true,
          tokens: {
            access_token: access,
            refresh_token: refresh,
            expires_at: expiresAt,
            obtained_at: Date.now(),
          },
        },
      },
      { merge: true }
    );

    // اشترك في الويبهوكس
    await fetch(`${appBase}/api/salla/subscribe?uid=${encodeURIComponent(uid)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }).catch(() => {});

    res.status(302).setHeader("Location", "/dashboard/integrations?salla=connected").end();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).send(msg);
  }
}
