// src/pages/api/salla/callback.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";

const SALLA_TOKEN_URL = process.env.SALLA_TOKEN_URL || "https://accounts.salla.sa/oauth2/token";
// 👇 الافتراضي .dev (بيئة المتجر التجريبي)
const SALLA_API_BASE  = (process.env.SALLA_API_BASE || "https://api.salla.dev").replace(/\/+$/,"");

const CLIENT_ID       = process.env.SALLA_CLIENT_ID!;
const CLIENT_SECRET   = process.env.SALLA_CLIENT_SECRET!;
const REDIRECT_URI    = process.env.SALLA_REDIRECT_URI!;
const APP_BASE        = (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || "").replace(/\/+$/,"");

type TokenResp = {
  token_type: "Bearer";
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
};

type SallaMe = {
  data?: { id?: string | number };
  store?: { id?: string | number };
  id?: string | number;
};

function withTimeout(ms: number) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(t) };
}

function redactToken(tok?: string | null) {
  if (!tok) return null;
  if (tok.length <= 12) return `${tok.length}ch:${tok}`;
  return `${tok.length}ch:${tok.slice(0,6)}…${tok.slice(-6)}`;
}

function pickStoreId(meJson: unknown) {
  const j = meJson as SallaMe | null | undefined;
  return j?.data?.id ?? j?.store?.id ?? j?.id ?? null;
}

function toErrorMessage(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

async function fetchWithTrace(
  url: string,
  init: RequestInit,
  opts?: { label?: string; timeoutMs?: number }
) {
  const label = opts?.label || "fetch";
  const timeoutMs = opts?.timeoutMs ?? 15000;
  const { signal, cancel } = withTimeout(timeoutMs);

  const startedAt = Date.now();
  let res: Response | null = null;
  let text = "";
  let ok = false;
  let status = 0;

  const headers: Record<string, string> = {};
  let errMsg = "";

  try {
    res = await fetch(url, { ...init, signal });
    status = res.status;
    res.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
    text = await res.text();
    if (text.length > 1024) text = text.slice(0, 1024) + "…[truncated]";
    ok = res.ok;
  } catch (e: unknown) {
    errMsg = toErrorMessage(e);
  } finally {
    cancel();
  }

  const elapsed = Date.now() - startedAt;
  console.error(`[salla/callback][${label}] url=${url}
  method=${(init.method || "GET")}
  status=${status} ok=${ok} elapsed_ms=${elapsed}
  headers=${JSON.stringify(headers)}
  error=${errMsg || "none"}
  body_snippet=${text ? JSON.stringify(text) : "none"}`);

  return { ok, status, headers, text, res, elapsed, error: errMsg || null };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const debugRequested = req.query.debug === "1";

  try {
    if (req.method !== "GET") return res.status(405).send("Method Not Allowed");

    const code  = typeof req.query.code  === "string" ? req.query.code  : undefined;
    const state = typeof req.query.state === "string" ? req.query.state : undefined;
    if (!code) return res.status(400).send("Missing code");

    if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
      console.error("[salla/callback] missing_oauth_env", { hasClientId: !!CLIENT_ID, hasSecret: !!CLIENT_SECRET, hasRedirect: !!REDIRECT_URI });
      return res.status(500).send("Salla OAuth env vars are not configured");
    }

    if (!APP_BASE) {
      console.warn("[salla/callback] APP_BASE not configured; redirects/webhook setup may fail.");
    }

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
      } catch (e: unknown) {
        console.error("[salla/callback] state_read_error", toErrorMessage(e));
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

    const tokRedacted = redactToken(tokens.access_token);
    console.error("[salla/callback] token_ok", { token: tokRedacted, scope: tokens.scope, expires_in: tokens.expires_in });

    if (!tokens.access_token) {
      return res.status(500).send("missing_access_token");
    }

    // 2) store info call (بدل stores/me)
    const meUrl = `${SALLA_API_BASE}/admin/v2/store/info`;
    let meJson: unknown = null;
    let storeId: string | number | null = null;

    const attempts = 3;
    for (let i = 1; i <= attempts; i++) {
      const meTrace = await fetchWithTrace(
        meUrl,
        { method: "GET", headers: { Authorization: `Bearer ${tokens.access_token}` } },
        { label: `store_info_attempt_${i}`, timeoutMs: 15000 }
      );

      if (meTrace.ok) {
        try {
          meJson = JSON.parse(meTrace.text || "{}") as unknown;
        } catch {
          console.error("[salla/callback] me_parse_error");
          return res.status(502).send("fetch_store_parse_error");
        }
        storeId = pickStoreId(meJson);
        console.error("[salla/callback] store_info_ok", { storeId, hasData: !!meJson });
        break;
      } else {
        if (meTrace.status === 401 || meTrace.status === 403) {
          console.error("[salla/callback] store_info_auth_error", { status: meTrace.status, body: meTrace.text, token: tokRedacted, SALLA_API_BASE });
          return res.status(meTrace.status).send("fetch_store_auth_error");
        }
        const delay = 400 * i;
        console.error(`[salla/callback] store_info_failed_attempt_${i}/${attempts} status=${meTrace.status} will_retry_in=${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    if (!storeId) {
      console.error("[salla/callback] cannot_resolve_store_id_final", { meJson });
      return res.status(502).send("fetch_store_network_error");
    }

    // 3) uid النهائي
    const uid = presetUid || `salla:${storeId}`;

    // 4) حفظ التوكنات
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

    // 5) الاشتراك في webhooks
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
      } catch (e: unknown) {
        console.warn("[salla/callback] webhook_subscribe_exception", toErrorMessage(e));
      }
    }

    // ✅ مسار الريدايركت قابل للتهيئة، مع مسار افتراضي موجود
    const DEFAULT_DEST = process.env.SALLA_AFTER_CONNECT_PATH || "/?salla=connected";
    const dest = returnTo || DEFAULT_DEST;

    if (debugRequested) {
      return res.status(200).json({
        ok: true,
        uid,
        storeId,
        apiBase: SALLA_API_BASE,
        token_preview: tokRedacted,
        scope: tokens.scope,
        expires_in: tokens.expires_in || null,
      });
    }

    return res.redirect(302, dest);
  } catch (e: unknown) {
    console.error("salla_callback_error", toErrorMessage(e));
    return res.status(500).send(toErrorMessage(e) || "internal_error");
  }
}
