import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";
import crypto from "crypto";
import { verifyStore, type AuthedRequest } from "@/utils/verifyStore";

const AUTHORIZE_URL =
  process.env.SALLA_AUTHORIZE_URL || "https://accounts.salla.sa/oauth2/authorize";
const CLIENT_ID = process.env.SALLA_CLIENT_ID!;
const REDIRECT_URI = process.env.SALLA_REDIRECT_URI!;
const SCOPE =
  process.env.SALLA_SCOPE ||
  "settings.read customers.read orders.read products.read webhooks.read_write offline_access";

function randId(n = 16) {
  return crypto.randomBytes(n).toString("hex");
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method Not Allowed" });

  // نتحقق من مالك المتجر الحالي (JWT/Session) — نفس نمط /api/store/settings عندك
  try {
    await verifyStore(req);
  } catch (e) {
    const err = e as Error & { status?: number };
    return res.status(err.status ?? 401).json({ ok: false, error: err.message || "Unauthorized" });
  }

  const { storeId } = req as AuthedRequest; // هذا هو ownerUid المنطقي لتجميع مستندات المنصات تحت هذا المتجر
  if (!storeId) return res.status(400).json({ ok: false, error: "Missing storeId" });

  if (!CLIENT_ID || !REDIRECT_URI) {
    return res.status(500).json({ ok: false, error: "Salla OAuth env vars not configured" });
  }

  const state = randId(12); // id لوثيقة state
  const db = dbAdmin();

  // نخزن state ليتم قراءته في /api/salla/callback (وفيه ownerUid)
  await db
    .collection("salla_oauth_state")
    .doc(state)
    .set({
      ownerUid: storeId,         // 👈 مهم
      createdAt: Date.now(),
      // returnTo: "/dashboard/settings?tab=linking", // اختياري
    });

  const url =
    `${AUTHORIZE_URL}?client_id=${encodeURIComponent(CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(SCOPE)}` +
    `&state=${encodeURIComponent(state)}`;

  return res.status(200).json({ ok: true, url });
}
