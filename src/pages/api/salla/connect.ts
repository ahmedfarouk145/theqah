import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";

const AUTH_URL   = process.env.SALLA_AUTHORIZE_URL || "https://accounts.salla.sa/oauth2/authorize";
const CLIENT_ID  = process.env.SALLA_CLIENT_ID!;
const REDIRECT   = process.env.SALLA_REDIRECT_URI!;
const SCOPES = [
  "settings.read", "customers.read", "orders.read",
  "products.read", "webhooks.read_write", "offline_access",
].join(" ");

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  try {
    const db = dbAdmin();

    // (اختياري) لو عندك uid/returnTo من الواجهة احفظه في state
    const stateId = Math.random().toString(36).slice(2);
    await db.collection("salla_oauth_state").doc(stateId).set({
      createdAt: Date.now(),
      // ownerUid: <ضع هوية المستخدم لو عندك سيشن>,
      returnTo: "/dashboard/integrations?salla=connected",
    }, { merge: true });

    const url = new URL(AUTH_URL);
    url.searchParams.set("client_id", CLIENT_ID);
    url.searchParams.set("redirect_uri", REDIRECT);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", SCOPES);
    url.searchParams.set("state", stateId);

    return res.status(200).json({ ok: true, url: url.toString() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ ok: false, error: msg });
  }
}
