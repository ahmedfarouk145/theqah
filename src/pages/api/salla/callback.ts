// src/pages/api/salla/callback.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin"; // لو عندك getDb في مسار مختلف، بدّل الاستيراد accordingly.

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "GET") {
      return res.status(405).send("Method Not Allowed");
    }

    const code = typeof req.query.code === "string" ? req.query.code : undefined;
    const state = typeof req.query.state === "string" ? req.query.state : undefined;
    if (!code) return res.status(400).send("Missing code");
    if (!state) return res.status(400).send("Missing state");

    const tokenUrl = process.env.SALLA_TOKEN_URL;
    const clientId = process.env.SALLA_CLIENT_ID;
    const clientSecret = process.env.SALLA_CLIENT_SECRET;
    const redirectUri = process.env.SALLA_REDIRECT_URI; // لازم يطابق المسجّل في لوحة سلة حرفيًا

    if (!tokenUrl || !clientId || !clientSecret || !redirectUri) {
      return res.status(500).send("Salla OAuth env vars are not configured");
    }

    const appBase =
      process.env.APP_BASE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      "";

    const db = dbAdmin();

    // --- تحقق state (الطريقة الأساسية: مستند Firestore أنشأناه في /api/salla/connect)
    const stateRef = db.collection("salla_oauth_state").doc(state);
    const snap = await stateRef.get();

    // بيانات التوجيه الافتراضية
    let uid: string | null = null;
    let returnTo = "/admin"; // fallback افتراضي

    if (snap.exists) {
      const st = snap.data() as { uid?: string; returnTo?: string; createdAt?: number } | undefined;
      uid = st?.uid || null;
      if (st?.returnTo) returnTo = st.returnTo;
      // صلاحية state (مثلاً 20 دقيقة) — اختياري
      // if (st?.createdAt && Date.now() - st.createdAt > 20 * 60 * 1000) { ... }
      await stateRef.delete().catch(() => {}); // تنظيف state بعد الاستخدام
    } else {
      // --- Fallback: لو كنت بترسل state كـ JSON فيه uid
      try {
        const parsed = JSON.parse(decodeURIComponent(state));
        uid = typeof parsed?.uid === "string" ? parsed.uid : null;
        if (typeof parsed?.returnTo === "string") returnTo = parsed.returnTo;
      } catch {
        // ignore
      }
    }

    if (!uid) return res.status(400).send("Invalid state (uid not found)");

    // --- تبادل الكود بالتوكن
    const resp = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri, // لازم يطابق نفس القيمة المستخدمة في خطوة التفويض
      }).toString(),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return res
        .status(resp.status)
        .send(`Token exchange failed: ${typeof data === "object" ? JSON.stringify(data) : String(data)}`);
    }
//eslint-disable-next-line @typescript-eslint/no-explicit-any
    const access = String((data as any).access_token || "");
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
    const refresh = ((data as any).refresh_token as string) || null;
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
    const expiresIn = Number((data as any).expires_in || 0);
    const expiresAt = expiresIn ? Date.now() + expiresIn * 1000 : null;

    if (!access) {
      return res.status(500).send("Missing access_token in Salla response");
    }

    // --- حفظ التوكنات في stores/{uid}
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
        updatedAt: Date.now(),
      },
      { merge: true }
    );

    // --- (اختياري قوي) الاشتراك في الويبهوكات مباشرة بعد الربط
    // لو عندك راوت اشتراك داخلي، استدعيه مع Secret لمنع إساءة الاستخدام
    const subscribeUrl = `${appBase.replace(/\/+$/, "")}/api/salla/subscribe?uid=${encodeURIComponent(uid)}`;
    try {
      await fetch(subscribeUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-cron-secret": process.env.CRON_SECRET || "", // لو راوت الاشتراك بيتحقق من ده
        },
      });
    } catch {
      // تجاهل الخطأ — ممكن تعيد المحاولة في Job لاحقًا
    }

    // --- التحويل لواجهة النجاح (من state) أو لمسار افتراضي
    const redirectTo =
      typeof returnTo === "string" && returnTo
        ? returnTo
        : "/dashboard/integrations?salla=connected";
    res.status(302).setHeader("Location", redirectTo).end();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Salla callback error:", msg);
    res.status(500).send(msg);
  }
}
