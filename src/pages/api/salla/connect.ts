// src/pages/api/salla/connect.ts
import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import { dbAdmin } from "@/lib/firebaseAdmin";
import { verifyStore } from "@/utils/verifyStore";

// ملاحظات بيئة التشغيل:
// SALLA_AUTHORIZE_URL: للإنتاج accounts.salla.com أو للاختبار accounts.salla.dev
// SALLA_CLIENT_ID
// SALLA_REDIRECT_URI: لازم يطابق المسجل في لوحة مطوري سلة بالحرف
// APP_BASE_URL أو NEXT_PUBLIC_BASE_URL: لاستخدامه كـ return افتراضي لو حبيت

const SCOPES = [
  // عدّل السكوبات حسب احتياجك الفعلي
  "read:orders",
  "read:products",
  "read:store",
].join(" ");

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ message: "Method Not Allowed" });
    }

    // تحقّق هوية المتجر (نفس أسلوب بقية API عندك)
    const { uid } = await verifyStore(req);

    const authUrl =
      process.env.SALLA_AUTHORIZE_URL ||
      "https://accounts.salla.com/oauth2/authorize"; // للإنتاج، بدّل لـ .dev لو بيئة اختبار

    const clientId = process.env.SALLA_CLIENT_ID;
    const redirectUri = process.env.SALLA_REDIRECT_URI;

    if (!clientId || !redirectUri) {
      return res.status(500).json({ message: "Salla client or redirect not configured" });
    }

    // state للـ CSRF + الربط بين المتجر والجلسة
    const state = crypto.randomBytes(16).toString("hex");
    const returnTo =
      (typeof req.query.return === "string" && req.query.return) ||
      process.env.APP_BASE_URL ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      "/";

    // خزّن الـ state مؤقتًا للتحقق في الكولباك
    const db = dbAdmin();
    await db.collection("salla_oauth_state").doc(state).set({
      id: state,
      uid,
      returnTo,
      createdAt: Date.now(),
    });

    const url =
      authUrl +
      `?response_type=code` +
      `&client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(SCOPES)}` +
      `&state=${encodeURIComponent(state)}`;

    // ارجع بالـ URL كـ JSON عشان الفرونت يحوّل المتصفح
    return res.status(200).json({ url });
  } catch (e) {
    console.error("Salla connect error:", e);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}
