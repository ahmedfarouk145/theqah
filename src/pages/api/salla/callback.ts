// src/pages/api/salla/callback.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";

const SALLA_TOKEN_URL   = process.env.SALLA_TOKEN_URL || "https://accounts.salla.sa/oauth2/token";
const SALLA_API_BASE    = process.env.SALLA_API_BASE   || "https://api.salla.dev";
const CLIENT_ID         = process.env.SALLA_CLIENT_ID!;
const CLIENT_SECRET     = process.env.SALLA_CLIENT_SECRET!;
const REDIRECT_URI      = process.env.SALLA_REDIRECT_URI!; // must match exactly in Salla console
const APP_BASE          =
  (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || "").replace(/\/+$/, "");

type TokenResp = {
  token_type: "Bearer";
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "GET") return res.status(405).send("Method Not Allowed");

    // 1) استلام كود الأثر
    const code  = typeof req.query.code  === "string" ? req.query.code  : undefined;
    const state = typeof req.query.state === "string" ? req.query.state : undefined;
    if (!code) return res.status(400).send("Missing code");

    if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
      return res.status(500).send("Salla OAuth env vars are not configured");
    }
    if (!APP_BASE) {
      // مش هنوقف الفلو، بس يفضّل ضبطه لاشتراك الويبهوكس والتحويل النهائي
      console.warn("[salla/callback] APP_BASE not configured; some redirects/webhook setup may fail.");
    }

    const db = dbAdmin();

    // 2) (اختياري) حاول تقرأ state من Firestore لو أنت بتولّده مسبقًا
    let presetUid: string | null = null;
    let returnTo: string | null = null;
    if (state) {
      const stRef = db.collection("salla_oauth_state").doc(state);
      const stSnap = await stRef.get();
      if (stSnap.exists) {
        const st = stSnap.data() as { uid?: string; returnTo?: string; createdAt?: number } | undefined;
        presetUid = typeof st?.uid === "string" ? st!.uid! : null;
        returnTo = typeof st?.returnTo === "string" ? st!.returnTo! : null;
        await stRef.delete().catch(() => {});
      } else {
        // دعم state مشفّر/JSON (fallback)
        try {
          const parsed = JSON.parse(decodeURIComponent(state));
          if (typeof parsed?.uid === "string") presetUid = parsed.uid;
          if (typeof parsed?.returnTo === "string") returnTo = parsed.returnTo;
        } catch { /* ignore */ }
      }
    }

    // 3) بدّل الكود بالتوكنات
    const tokenRes = await fetch(SALLA_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI, // لازم يطابق المسجّل في سلة حرفيًا
      }),
    });
    const tokens = (await tokenRes.json().catch(() => ({}))) as Partial<TokenResp>;
    if (!tokenRes.ok || !tokens.access_token) {
      return res
        .status(tokenRes.status || 502)
        .send(`token_exchange_failed: ${JSON.stringify(tokens)}`);
    }

    // 4) هات هوية المتجر: /admin/v2/stores/me
    const meRes = await fetch(`${SALLA_API_BASE}/admin/v2/stores/me`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const meJson = await meRes.json().catch(() => ({}));
    if (!meRes.ok) {
      return res.status(meRes.status).send(`fetch_store_failed: ${JSON.stringify(meJson)}`);
    }

    // استخرج storeId بحسب الاستجابة الفعلية (جرّب الحقول الشائعة)
    const storeId =
      meJson?.data?.id ??
      meJson?.store?.id ??
      meJson?.id ??
      null;

    if (!storeId) {
      return res.status(500).send("cannot_resolve_store_id");
    }

    // 5) حدّد uid النهائي (لو state عطانا uid استخدمه، وإلا استخدم salla:<storeId>)
    const uid = presetUid || `salla:${storeId}`;

    // 6) خزّن أو عدّل سجلاتك
    const expiresIn = Number(tokens.expires_in || 0);
    const expiresAt = expiresIn ? Date.now() + expiresIn * 1000 : null;
    await db.collection("salla_tokens").doc(uid).set(
      {
        uid,
        provider: "salla",
        storeId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || null,
        expiresIn: expiresIn || null,
        expiresAt,
        scope: tokens.scope || null,
        obtainedAt: Date.now(),
      },
      { merge: true }
    );

    await db.collection("stores").doc(uid).set(
      {
        uid,
        platform: "salla",
        salla: {
          storeId,
          connected: true,
        },
        connectedAt: Date.now(),
        updatedAt: Date.now(),
      },
      { merge: true }
    );

    // 7) (اختياري) اشترك في الويبهوكس فورًا
    // يفضل تتحقق داخل /api/salla/subscribe من صلاحية الطلب (هيدر سري)
    if (APP_BASE) {
      try {
        await fetch(`${APP_BASE}/api/salla/subscribe?uid=${encodeURIComponent(uid)}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-cron-secret": process.env.CRON_SECRET || "",
          },
        });
      } catch (e) {
        console.warn("[salla/callback] webhook subscribe failed (will ignore):", e);
      }
    }

    // 8) رجّع المستخدم لواجهة النجاح
    const dest = returnTo || "/dashboard/integrations?salla=connected";
    return res.redirect(302, dest);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    console.error("salla_callback_error", e?.message || e);
    return res.status(500).send(e?.message || "internal_error");
  }
}
