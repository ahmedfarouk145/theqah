// src/pages/api/salla/connect.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";
import { getAuth } from "firebase-admin/auth";
import { getDefaultSallaScopes } from "@/lib/salla/scopes";

const AUTH_BASE = process.env.SALLA_AUTH_URL || "https://accounts.salla.sa/oauth2/authorize";
const CLIENT_ID = process.env.SALLA_CLIENT_ID!;
const REDIRECT_URI = process.env.SALLA_REDIRECT_URI!;

function randomId(n = 16) {
  return Array.from(crypto.getRandomValues(new Uint8Array(n))).map(b => b.toString(16).padStart(2,"0")).join("");
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method Not Allowed" });

    // تحقق من التوكن
    const idToken = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!idToken) return res.status(401).json({ ok: false, error: "Missing idToken" });
    const auth = getAuth();
    const decoded = await auth.verifyIdToken(idToken);
    const ownerUid = decoded.uid;

    const db = dbAdmin();

    // 🆕 دعم تخصيص الصلاحيات من الـ request body
    const { customScopes } = req.body || {};
    const scope = customScopes || getDefaultSallaScopes();

    const stateId = randomId(16);
    await db.collection("salla_oauth_state").doc(stateId).set({
      ownerUid,
      requestedScopes: scope,
      createdAt: Date.now(),
      // returnTo: "/dashboard?salla=connected" // إن حبيت
    });

    const url = new URL(AUTH_BASE);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", CLIENT_ID);
    url.searchParams.set("redirect_uri", REDIRECT_URI);
    url.searchParams.set("scope", scope);
    url.searchParams.set("state", stateId);

    return res.status(200).json({ 
      ok: true, 
      url: url.toString(),
      scopes: scope.split(' ')
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: (e as Error).message });
  }
}
