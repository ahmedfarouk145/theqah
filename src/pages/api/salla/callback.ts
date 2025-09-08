// src/pages/api/salla/callback.ts
import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import { dbAdmin } from "@/lib/firebaseAdmin";

const SALLA_TOKEN_URL = process.env.SALLA_TOKEN_URL || "https://accounts.salla.sa/oauth2/token";
const DEFAULT_API_BASE = (process.env.SALLA_API_BASE || "https://api.salla.sa").replace(/\/+$/, "");
const CLIENT_ID = process.env.SALLA_CLIENT_ID!;
const CLIENT_SECRET = process.env.SALLA_CLIENT_SECRET!;
const REDIRECT_URI = process.env.SALLA_REDIRECT_URI!;

const APP_BASE = (
  process.env.APP_BASE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NEXT_PUBLIC_BASE_URL ||
  ""
).replace(/\/+$/, "");

const AFTER_PATH = process.env.SALLA_AFTER_CONNECT_PATH || "/dashboard?salla=connected";

type TokenResp = {
  token_type: "Bearer";
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
};

type SallaStoreInfo = {
  data?: {
    id?: number | string;
    name?: string;
    domain?: string;
    type?: "demo" | "real" | string;
  };
};

function withTimeout(ms: number) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(t) };
}
const toErr = (e: unknown) => (e instanceof Error ? e.message : String(e));
const redact = (tok?: string | null) =>
  !tok ? null : tok.length <= 12 ? `${tok.length}ch:${tok}` : `${tok.length}ch:${tok.slice(0,6)}…${tok.slice(-6)}`;
const randHex = (len=16) => crypto.randomBytes(len).toString("hex");

async function fetchWithTrace(url: string, init: RequestInit, opts?: { label?: string; timeoutMs?: number }) {
  const label = opts?.label || "fetch";
  const timeoutMs = opts?.timeoutMs ?? 15000;
  const { signal, cancel } = withTimeout(timeoutMs);
  const startedAt = Date.now();
  let text = "", ok = false, status = 0, errMsg = "";
  const headers: Record<string,string> = {};
  try {
    const r = await fetch(url, { ...init, signal });
    status = r.status;
    r.headers.forEach((v,k)=>{ headers[k.toLowerCase()] = v; });
    text = await r.text();
    if (text.length > 1024) text = text.slice(0,1024) + "…[truncated]";
    ok = r.ok;
  } catch (e) { errMsg = toErr(e); }
  finally { cancel(); }
  const elapsed = Date.now() - startedAt;
  console.error(`[salla/callback][${label}] url=${url}
  method=${init.method || "GET"}
  status=${status} ok=${ok} elapsed_ms=${elapsed}
  headers=${JSON.stringify(headers)}
  error=${errMsg || "none"}
  body_snippet=${text ? JSON.stringify(text) : "none"}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { ok, status, headers, text, res: null as any, elapsed, error: errMsg || null };
}

function decideApiBase(info: SallaStoreInfo | null | undefined): string {
  const type = (info?.data?.type || "").toLowerCase();
  const domain = String(info?.data?.domain || "");
  if (type === "demo") return "https://api.salla.dev";
  if (domain.includes("salla.dev")) return "https://api.salla.dev";
  return "https://api.salla.sa";
}

function cookieStr(name: string, value: string, maxAgeSec: number) {
  // ملاحظة: لا نستخدم HttpOnly لأننا نقرأ الكوكي بالعميل
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSec}; SameSite=Lax; Secure`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const debugRequested = req.query.debug === "1";
  try {
    if (req.method !== "GET") return res.status(405).send("Method Not Allowed");

    const code  = typeof req.query.code  === "string" ? req.query.code  : undefined;
    const state = typeof req.query.state === "string" ? req.query.state : undefined;
    if (!code) return res.status(400).send("Missing code");

    if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
      console.error("[salla/callback] missing_oauth_env");
      return res.status(500).send("Salla OAuth env vars are not configured");
    }
    if (!APP_BASE) console.warn("[salla/callback] APP_BASE not configured");

    const db = dbAdmin();

    // state → ownerUid (اختياري)
    let presetUid: string | null = null;
    let returnTo: string | null = null;
    let ownerUid: string | null = null;
    if (state) {
      try {
        const stRef = db.collection("salla_oauth_state").doc(state);
        const stSnap = await stRef.get();
        if (stSnap.exists) {
          const st = stSnap.data() as { uid?: string; returnTo?: string; ownerUid?: string } | undefined;
          presetUid = typeof st?.uid === "string" ? st.uid : null;
          returnTo  = typeof st?.returnTo === "string" ? st.returnTo : null;
          ownerUid  = typeof st?.ownerUid === "string" ? st.ownerUid : null;
          await stRef.delete().catch(() => {});
        } else {
          try {
            const parsed = JSON.parse(decodeURIComponent(state)) as { uid?: string; returnTo?: string; ownerUid?: string };
            if (typeof parsed?.uid === "string") presetUid = parsed.uid;
            if (typeof parsed?.returnTo === "string") returnTo = parsed.returnTo;
            if (typeof parsed?.ownerUid === "string") ownerUid = parsed.ownerUid;
          } catch {}
        }
      } catch (e) { console.error("[salla/callback] state_read_error", toErr(e)); }
    }

    // 1) token exchange
    const tokenForm = new URLSearchParams({
      grant_type: "authorization_code",
      code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, redirect_uri: REDIRECT_URI,
    }).toString();

    const tokenTrace = await fetchWithTrace(
      SALLA_TOKEN_URL,
      { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: tokenForm },
      { label: "token_exchange", timeoutMs: 15000 }
    );
    if (!tokenTrace.ok) return res.status(tokenTrace.status || 502).send("token_exchange_failed");

    let tokens: Partial<TokenResp> = {};
    try { tokens = JSON.parse(tokenTrace.text || "{}") as Partial<TokenResp>; }
    catch { return res.status(502).send("token_parse_error"); }
    if (!tokens.access_token) return res.status(500).send("missing_access_token");

    // 2) store info
    const meUrl = `${DEFAULT_API_BASE}/admin/v2/store/info`;
    const meTrace = await fetchWithTrace(
      meUrl,
      { method: "GET", headers: { Authorization: `Bearer ${tokens.access_token}` } },
      { label: "store_info", timeoutMs: 15000 }
    );
    if (!meTrace.ok) return res.status(meTrace.status || 502).send("fetch_store_error");

    const info = JSON.parse(meTrace.text || "{}") as SallaStoreInfo;
    const storeId     = info?.data?.id;
    const storeName   = info?.data?.name || null;
    const storeDomain = info?.data?.domain || null;
    if (!storeId) return res.status(502).send("cannot_resolve_store_id");

    const apiBaseForStore = decideApiBase(info);
    const uid = presetUid || `salla:${storeId}`;

    const expiresIn = Number(tokens.expires_in || 0);
    const expiresAt = expiresIn ? Date.now() + expiresIn * 1000 : null;

    await db.collection("salla_tokens").doc(uid).set({
      uid, provider: "salla", storeId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || null,
      expiresIn: expiresIn || null,
      expiresAt,
      scope: tokens.scope || null,
      obtainedAt: Date.now(),
      storeName, storeDomain, apiBase: apiBaseForStore,
    }, { merge: true });

    // المستند الحقيقي
    await db.collection("stores").doc(uid).set({
      uid,
      platform: "salla",
      ownerUid: ownerUid || null,
      salla: {
        storeId,
        connected: true,
        installed: true,
        installedAt: Date.now(),
        storeName,
        domain: storeDomain,
        apiBase: apiBaseForStore,
      },
      uninstalledAt: null, // نلغي أي قيمة قديمة
      connectedAt: Date.now(),
      updatedAt: Date.now(),
    }, { merge: true });

    // ✅ alias على stores/{ownerUid} لو معروف
    if (ownerUid) {
      await db.collection("stores").doc(ownerUid).set({
        ownerUid,
        platform: "salla",
        storeUid: uid,           // يشير للمستند الحقيقي
        storeName,
        updatedAt: Date.now(),
      }, { merge: true });
    }

    // webhooks (اختياري)
    if (APP_BASE) {
      try {
        const subUrl = `${APP_BASE}/api/salla/subscribe?uid=${encodeURIComponent(uid)}`;
        await fetchWithTrace(
          subUrl,
          { method: "POST", headers: { "Content-Type": "application/json", "x-cron-secret": process.env.CRON_SECRET || "" } },
          { label: "webhooks_subscribe", timeoutMs: 10000 }
        );
      } catch (e) { console.warn("[salla/callback] webhook_subscribe_exception", toErr(e)); }
    }

    // 3) Onboarding token (يحمل storeUid) — اختياري
    let onboardingUrl: string | null = null;
    try {
      const tokenId = randHex(16);
      const now = Date.now();
      await db.collection("onboarding_tokens").doc(tokenId).set({
        id: tokenId,
        storeUid: uid,
        uid,
        createdAt: now,
        expiresAt: now + 15 * 60 * 1000,
        usedAt: null,
        store: { id: storeId, name: storeName, domain: storeDomain },
        purpose: "set_password_after_salla_connect",
      });
      if (APP_BASE) onboardingUrl = `${APP_BASE}/onboarding/set-password?t=${tokenId}`;
    } catch (e) { console.warn("[salla/callback] onboarding_token_error", toErr(e)); }

    // 🔒 اضبط الكوكيّات قبل التحويل
    res.setHeader("Set-Cookie", [
      cookieStr("salla_store_uid", uid, 60 * 60 * 24 * 365), // سنة
      cookieStr("salla_connected", "1", 60 * 60),            // ساعة
    ]);

    const destBase = APP_BASE || "";
    const dest = (onboardingUrl || `${destBase}${AFTER_PATH}`) + `&uid=${encodeURIComponent(uid)}`;

    if (debugRequested) {
      return res.status(200).json({ ok: true, uid, ownerUid, storeId, storeName, storeDomain, redirect_to: dest });
    }
    return res.redirect(302, dest);
  } catch (e) {
    console.error("salla_callback_error", toErr(e));
    return res.status(500).send(toErr(e) || "internal_error");
  }
}
