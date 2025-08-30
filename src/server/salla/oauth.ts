import crypto from "crypto";

const AUTH_URL = "https://accounts.salla.sa/oauth2/auth";
const TOKEN_URL = "https://accounts.salla.sa/oauth2/token";
const USER_INFO_URL = "https://accounts.salla.sa/oauth2/user/info";

export function buildAuthUrl(opts: { state: string }) {
  const params = new URLSearchParams({
    client_id: process.env.SALLA_CLIENT_ID || "",
    response_type: "code",
    redirect_uri: process.env.SALLA_REDIRECT_URI || "",
    scope: process.env.SALLA_SCOPES || "orders.read customers.read webhooks.read_write",
    state: opts.state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForToken(code: string) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: process.env.SALLA_REDIRECT_URI || "",
    client_id: process.env.SALLA_CLIENT_ID || "",
    client_secret: process.env.SALLA_CLIENT_SECRET || "",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${text}`);
  }
  return (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    token_type: "Bearer";
    expires_in: number; // seconds
    scope?: string;
  };
}

export async function refreshAccessToken(refresh_token: string) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token,
    client_id: process.env.SALLA_CLIENT_ID || "",
    client_secret: process.env.SALLA_CLIENT_SECRET || "",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Refresh failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    token_type: "Bearer";
    expires_in: number;
    scope?: string;
  };
}

export async function getUserInfo(access_token: string) {
  const res = await fetch(USER_INFO_URL, {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!res.ok) throw new Error(`User info failed: ${res.status} ${await res.text()}`);
  //eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (await res.json()) as any;
}

/** state توقيع والتحقق من  */
export function signState(raw: string) {
  const key = process.env.APP_STATE_SECRET || "dev_secret";
  const sig = crypto.createHmac("sha256", key).update(raw).digest("hex");
  return `${raw}.${sig}`;
}
export function verifyState(signed: string) {
  const i = signed.lastIndexOf(".");
  if (i <= 0) return null;
  const raw = signed.slice(0, i);
  const sig = signed.slice(i + 1);
  const key = process.env.APP_STATE_SECRET || "dev_secret";
  const check = crypto.createHmac("sha256", key).update(raw).digest("hex");
  const ok =
    sig.length === check.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(check));
  return ok ? raw : null;
}
