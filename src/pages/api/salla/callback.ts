// src/pages/api/salla/callback.ts
import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import { dbAdmin } from "@/lib/firebaseAdmin";

const SALLA_TOKEN_URL = process.env.SALLA_TOKEN_URL || "https://accounts.salla.sa/oauth2/token";
// نبدأ بـ sa كافتراضي آمن، ثم نقرر .dev لو المتجر Demo
const DEFAULT_API_BASE = (process.env.SALLA_API_BASE || "https://api.salla.sa").replace(/\/+$/, "");

const CLIENT_ID     = process.env.SALLA_CLIENT_ID!;
const CLIENT_SECRET = process.env.SALLA_CLIENT_SECRET!;
const REDIRECT_URI  = process.env.SALLA_REDIRECT_URI!;
const APP_BASE      = (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || "").replace(/\/+$/, "");
const AFTER_PATH    = process.env.SALLA_AFTER_CONNECT_PATH || "/dashboard/integrations?salla=connected";

type TokenResp = {
  token_type: "Bearer";
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
};

type SallaStoreInfo = {
  status?: number;
  success?: boolean;
  data?: {
    id?: number | string;
    name?: string;
    domain?: string;
    currency?: string;
    plan?: string;
    status?: string;
    description?: string;
    email?: string;
    type?: "demo" | "real" | string; // مهم لاختيار apiBase
  };
};

function withTimeout(ms: number) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(t) };
}

const toErr = (e: unknown) => (e instanceof Error ? e.message : String(e));
const redact = (tok?: string | null) =>
  !tok ? null : tok.length <= 12 ? `${tok.length}ch:${tok}` : `${tok.length}ch:${tok.slice(0, 6)}…${tok.slice(-6)}`;
const randHex = (len = 16) => crypto.randomBytes(len).toString("hex");

async function fetchWithTrace(
  url: string,
  init: RequestInit,
  opts?: { label?: string; timeoutMs?: number }
) {
  const label = opts?.label || "fetch";
  const timeoutMs = opts?.timeoutMs ?? 15000;
  const { signal, cancel } = withTimeout(timeoutMs);

  const startedAt = Date.now();
  let text = "";
  let ok = false;
  let status = 0;
  const headers: Record<string, string> = {};
  let errMsg = "";

  try {
    const r = await fetch(url, { ...init, signal });
    status = r.status;
    r.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
    text = await r.text();
    if (text.length > 1024) text = text.slice(0, 1024) + "…[truncated]";
    ok = r.ok;
  } catch (e) {
    errMsg = toErr(e);
  } finally {
    cancel();
  }

  const elapsed = Date.now() - startedAt;
  console.error(`[salla/callback][${label}] url=${url}
  method=${init.method || "GET"}
  status=${status} ok=${ok} elapsed_ms=${elapsed}
  headers=${JSON.stringify(headers)}
  error=${errMsg || "none"}
  body_snippet=${text ? JSON.stringify(text) : "none"}`);

  // نرجّع res كـ any لتجنّب تحذير TS بلا حاجة
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { ok, status, headers, text, res: null as any, elapsed, error: errMsg || null };
}

function decideApiBase(info: SallaStoreInfo | null | undefined): string {
  const type = (info?.data?.type || "").toLowerCase();
  const domain = String(info?.data?.domain || "");
  // لو النوع demo → استخدم api.salla.dev
  // بعض الديمو دومينهم salla.sa لكن فيه مسار /dev-…، لذلك فحص النوع أدق.
  if (type === "demo") return "https://api.salla.dev";
  // fallback: لو ظهر domain يحوي ".dev" لأي سبب
  if (domain.includes("salla.dev")) return "https://api.salla.dev";
  return "https://api.salla.sa";
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const debugRequested = req.query.debug === "1";

  try {
    if (req.method !== "GET") return res.status(405).send("Method Not Allowed");

    const code  = typeof req.query.code  === "string" ? req.query.code  : undefined;
    const state = typeof req.query.state === "string" ? req.query.state : undefined;
    if (!code) return res.status(400).send("Missing code");

    if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
      console.error("[salla/callback] missing_oauth_env", {
        hasClientId: !!CLIENT_ID,
        hasSecret: !!CLIENT_SECRET,
        hasRedirect: !!REDIRECT_URI,
      });
      return res.status(500).send("Salla OAuth env vars are not configured");
    }

    if (!APP_BASE) {
      console.warn("[salla/callback] APP_BASE not configured; redirects/webhook setup may fail.");
    }

    // ✅ عرّف db مرّة واحدة
    const db = dbAdmin();

    // (اختياري) state handling
    let presetUid: string | null = null;
    let returnTo: string | null = null;
    if (state) {
      try {
        const stRef = db.collection("salla_oauth_state").doc(state);
        const stSnap = await stRef.get();
        if (stSnap.exists) {
          const st = stSnap.data() as { uid?: string; returnTo?: string; createdAt?: number } | undefined;
          presetUid = typeof st?.uid === "string" ? st.uid : null;
          returnTo = typeof st?.returnTo === "string" ? st.returnTo : null;
          await stRef.delete().catch(() => {});
        } else {
          try {
            const parsed = JSON.parse(decodeURIComponent(state)) as { uid?: string; returnTo?: string };
            if (typeof parsed?.uid === "string") presetUid = parsed.uid;
            if (typeof parsed?.returnTo === "string") returnTo = parsed.returnTo;
          } catch { /* ignore */ }
        }
      } catch (e) {
        console.error("[salla/callback] state_read_error", toErr(e));
      }
    }

    // 1) token exchange
    const tokenForm = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
    }).toString();

    const tokenTrace = await fetchWithTrace(
      SALLA_TOKEN_URL,
      { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: tokenForm },
      { label: "token_exchange", timeoutMs: 15000 }
    );

    if (!tokenTrace.ok) {
      console.error("[salla/callback] token_exchange_failed_details", { status: tokenTrace.status, body: tokenTrace.text });
      return res.status(tokenTrace.status || 502).send("token_exchange_failed");
    }

    let tokens: Partial<TokenResp> = {};
    try {
      tokens = JSON.parse(tokenTrace.text || "{}") as Partial<TokenResp>;
    } catch {
      console.error("[salla/callback] token_parse_error");
      return res.status(502).send("token_parse_error");
    }

    console.error("[salla/callback] token_ok", {
      token: redact(tokens.access_token),
      scope: tokens.scope,
      expires_in: tokens.expires_in,
    });

    if (!tokens.access_token) {
      return res.status(500).send("missing_access_token");
    }

    // 2) store info باستخدام DEFAULT_API_BASE (يعمل لكلا البيئتين)
    const meUrl = `${DEFAULT_API_BASE}/admin/v2/store/info`;
    const meTrace = await fetchWithTrace(
      meUrl,
      { method: "GET", headers: { Authorization: `Bearer ${tokens.access_token}` } },
      { label: "store_info", timeoutMs: 15000 }
    );

    if (!meTrace.ok) {
      if (meTrace.status === 401 || meTrace.status === 403) {
        return res.status(meTrace.status).send("fetch_store_auth_error");
      }
      return res.status(meTrace.status || 502).send("fetch_store_network_error");
    }

    const info = JSON.parse(meTrace.text || "{}") as SallaStoreInfo;
    const storeId     = info?.data?.id;
    const storeName   = info?.data?.name || null;
    const storeDomain = info?.data?.domain || null;
    if (!storeId) return res.status(502).send("cannot_resolve_store_id");

    // 2.1) حدد الـ apiBase للمتجر واحفظه
    const apiBaseForStore = decideApiBase(info);

    // 3) uid النهائي
    const uid = presetUid || `salla:${storeId}`;

    // 4) حفظ التوكنات + بيانات المتجر
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
        storeName,
        storeDomain,
        apiBase: apiBaseForStore,
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
          storeName,
          domain: storeDomain,
          apiBase: apiBaseForStore,
        },
        connectedAt: Date.now(),
        updatedAt: Date.now(),
      },
      { merge: true }
    );

    // 5) الاشتراك في webhooks عبر API داخلي يقرأ apiBase من Firestore
    if (APP_BASE) {
      try {
        const subUrl = `${APP_BASE}/api/salla/subscribe?uid=${encodeURIComponent(uid)}`;
        const trace = await fetchWithTrace(
          subUrl,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-cron-secret": process.env.CRON_SECRET || "",
            },
          },
          { label: "webhooks_subscribe", timeoutMs: 10000 }
        );
        if (!trace.ok) {
          console.warn("[salla/callback] webhook_subscribe_failed", { status: trace.status, body: trace.text });
        }
      } catch (e) {
        console.warn("[salla/callback] webhook_subscribe_exception", toErr(e));
      }
    }

    // 6) إنشاء Onboarding Token للتحويل إلى صفحة تعيين كلمة المرور
    let onboardingUrl: string | null = null;
    try {
      const tokenId = randHex(16);
      const now = Date.now();
      await db.collection("onboarding_tokens").doc(tokenId).set({
        id: tokenId,
        uid,
        createdAt: now,
        expiresAt: now + 15 * 60 * 1000, // 15 دقيقة
        usedAt: null,
        store: { id: storeId, name: storeName, domain: storeDomain },
        purpose: "set_password_after_salla_connect",
      });
      if (APP_BASE) onboardingUrl = `${APP_BASE}/onboarding/set-password?t=${tokenId}`;
    } catch (e) {
      console.warn("[salla/callback] onboarding_token_error", toErr(e));
    }

    const dest = onboardingUrl || returnTo || AFTER_PATH;

    if (debugRequested) {
      return res.status(200).json({
        ok: true,
        uid,
        storeId,
        apiBase: apiBaseForStore,
        token_preview: redact(tokens.access_token),
        scope: tokens.scope,
        expires_in: tokens.expires_in || null,
        storeName,
        storeDomain,
        redirect_to: dest,
      });
    }

    return res.redirect(302, dest);
  } catch (e) {
    console.error("salla_callback_error", toErr(e));
    return res.status(500).send(toErr(e) || "internal_error");
  }
}
