import * as admin from "firebase-admin";

type UnknownRecord = Record<string, unknown>;

export type SallaAuth = {
  access_token: string;
  refresh_token?: string | null;
  scope?: string | null;
  expires?: number | null;   // unix seconds
  receivedAt?: number | null;
};

const API_BASE = "https://api.salla.dev/admin/v2";
const USERINFO_URL = "https://accounts.salla.sa/oauth2/user/info";
const APP_ID = (process.env.SALLA_APP_ID || "").trim();

function firestore() {
  return admin.firestore();
}

async function loadAuth(storeUid: string): Promise<SallaAuth | null> {
  const db = firestore();
  const doc = await db.collection("owners").doc(storeUid).get();
  const data = doc.data() as UnknownRecord | undefined;
  const oauth = data?.oauth as UnknownRecord | undefined;
  if (!oauth?.access_token) return null;
  return {
    access_token: String(oauth.access_token),
    refresh_token: oauth.refresh_token ? String(oauth.refresh_token) : null,
    scope: oauth.scope ? String(oauth.scope) : null,
    expires: typeof oauth.expires === "number" ? oauth.expires : null,
    receivedAt: typeof oauth.receivedAt === "number" ? oauth.receivedAt : null,
  };
}

// بإمكانك لاحقًا تنفيذ refresh حقيقي إن توفر
async function refreshIfNeeded(storeUid: string): Promise<SallaAuth | null> {
  const auth = await loadAuth(storeUid);
  if (!auth) return null;
  const exp = auth.expires;
  if (!exp) return auth;
  const nowSec = Math.floor(Date.now() / 1000);
  if (nowSec < exp - 60) return auth;
  // TODO: نفّذ ريفرش عبر سيرفر OAuth لو لديك
  return auth; // مؤقتًا
}

export async function sallaFetch(storeUid: string, path: string, init?: RequestInit): Promise<Response> {
  const auth = (await refreshIfNeeded(storeUid)) || (await loadAuth(storeUid));
  if (!auth?.access_token) throw new Error("missing_access_token");
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${auth.access_token}`,
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  return fetch(url, { ...init, headers });
}

export async function fetchUserInfo(storeUid: string): Promise<UnknownRecord> {
  const res = await sallaFetch(storeUid, USERINFO_URL, { method: "GET" });
  if (!res.ok) throw new Error(`userinfo ${res.status}`);
  return res.json() as Promise<UnknownRecord>;
}

export async function fetchAppSubscriptions(storeUid: string): Promise<UnknownRecord> {
  if (!APP_ID) throw new Error("SALLA_APP_ID not configured");
  const res = await sallaFetch(storeUid, `/apps/${APP_ID}/subscriptions`, { method: "GET" });
  if (!res.ok) throw new Error(`subscriptions ${res.status}`);
  return res.json() as Promise<UnknownRecord>;
}
