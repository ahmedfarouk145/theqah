// src/pages/api/salla/callback.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";

const SALLA_TOKEN_URL = process.env.SALLA_TOKEN_URL || "https://accounts.salla.sa/oauth2/token";

const SALLA_API_BASE  = process.env.SALLA_API_BASE  || "https://api.salla.sa";

const CLIENT_ID       = process.env.SALLA_CLIENT_ID!;
const CLIENT_SECRET   = process.env.SALLA_CLIENT_SECRET!;
const REDIRECT_URI    = process.env.SALLA_REDIRECT_URI!;
const APP_BASE = (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || "").replace(/\/+$/, "");

type TokenResp = {
  token_type: "Bearer";
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
};

function withTimeout(ms: number) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(t) };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "GET") return res.status(405).send("Method Not Allowed");

    const code  = typeof req.query.code  === "string" ? req.query.code  : undefined;
    const state = typeof req.query.state === "string" ? req.query.state : undefined;
    if (!code) return res.status(400).send("Missing code");

    if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
      return res.status(500).send("Salla OAuth env vars are not configured");
    }
    if (!APP_BASE) {
      console.warn("[salla/callback] APP_BASE not configured; redirects/webhook setup may fail.");
    }

    const db = dbAdmin();

    // (اختياري) قراءة state مسبقًا إن لقيّناه
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
        try {
          const parsed = JSON.parse(decodeURIComponent(state));
          if (typeof parsed?.uid === "string") presetUid = parsed.uid;
          if (typeof parsed?.returnTo === "string") returnTo = parsed.returnTo;
        } catch { /* ignore */ }
      }
    }

    // 1) تبادل الكود بالتوكنات
    let tokens: Partial<TokenResp> = {};
    try {
      const { signal, cancel } = withTimeout(15000);
      const tokenRes = await fetch(SALLA_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
        }),
        signal,
      });
      cancel();
      tokens = (await tokenRes.json().catch(() => ({}))) as Partial<TokenResp>;
      if (!tokenRes.ok || !tokens.access_token) {
        console.error("[salla/callback] token_exchange_failed", tokenRes.status, tokens);
        return res.status(tokenRes.status || 502).send(`token_exchange_failed`);
      }
      //eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      console.error("[salla/callback] token_exchange_network_error:", e?.message || e);
      return res.status(502).send("token_exchange_network_error");
    }

    // 2) جلب بيانات المتجر
    let storeId: string | number | null = null;
    try {
      const { signal, cancel } = withTimeout(15000);
      const meRes = await fetch(`${SALLA_API_BASE}/admin/v2/stores/me`, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
        signal,
      });
      cancel();
      const meJson = await meRes.json().catch(() => ({}));
      if (!meRes.ok) {
        console.error("[salla/callback] fetch_store_failed", meRes.status, meJson);
        return res.status(meRes.status || 502).send("fetch_store_failed");
      }
      storeId = meJson?.data?.id ?? meJson?.store?.id ?? meJson?.id ?? null;
      if (!storeId) {
        console.error("[salla/callback] cannot_resolve_store_id", meJson);
        return res.status(500).send("cannot_resolve_store_id");
      }
      //eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      console.error("[salla/callback] fetch_store_network_error:", e?.message || e);
      return res.status(502).send("fetch_store_network_error");
    }

    // 3) uid النهائي
    const uid = presetUid || `salla:${storeId}`;

    // 4) تخزين التوكنات والربط
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
        salla: { storeId, connected: true },
        connectedAt: Date.now(),
        updatedAt: Date.now(),
      },
      { merge: true }
    );

    // 5) الاشتراك في الويبهوكس (اختياري)
    if (APP_BASE) {
      try {
        const { signal, cancel } = withTimeout(10000);
        await fetch(`${APP_BASE}/api/salla/subscribe?uid=${encodeURIComponent(uid)}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-cron-secret": process.env.CRON_SECRET || "",
          },
          signal,
        });
        cancel();
      } catch (e) {
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
        console.warn("[salla/callback] webhook subscribe failed:", (e as any)?.message || e);
      }
    }

    const dest = returnTo || "/dashboard/integrations?salla=connected";
    return res.redirect(302, dest);
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    console.error("salla_callback_error", e?.message || e);
    return res.status(500).send(e?.message || "internal_error");
  }
}
