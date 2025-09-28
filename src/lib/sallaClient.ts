import * as admin from "firebase-admin";

type UnknownRecord = Record<string, unknown>;

export type SallaAuth = {
  access_token: string;
  refresh_token?: string | null;
  scope?: string | null;
  expires?: number | null; // unix (seconds)
  receivedAt?: number | null; // ms
};

const API_BASE = "https://api.salla.dev/admin/v2";
const USERINFO_URL = "https://accounts.salla.sa/oauth2/user/info";

const APP_ID = (process.env.SALLA_APP_ID || "").trim(); // من Partner Portal
if (!APP_ID) console.warn("[sallaClient] SALLA_APP_ID is not set (subscriptions sync will be limited)");

function firestore() {
  // يفضّل تفعيل ignoreUndefinedProperties مرّة واحدة في init
  const db = admin.firestore();
  return db;
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

async function saveAuth(storeUid: string, auth: SallaAuth) {
  const db = firestore();
  await db.collection("owners").doc(storeUid).set({
    uid: storeUid,
    provider: "salla",
    oauth: {
      access_token: auth.access_token,
      refresh_token: auth.refresh_token ?? null,
      scope: auth.scope ?? null,
      expires: auth.expires ?? null,
      receivedAt: Date.now(),
      strategy: "easy_mode",
    },
    updatedAt: Date.now(),
  }, { merge: true });
}

/** تحقّق صلاحية التوكن (نافذ؟) */
function isExpired(auth: SallaAuth): boolean {
  if (!auth.expires) return false; // بعض التوكينات قد تكون طويلة الأمد
  const nowSec = Math.floor(Date.now() / 1000);
  // هامش 60 ثانية
  return nowSec >= (auth.expires - 60);
}

/** (اختياري) ريفرش — لو عندك endpoint تبادل/تحديث توكنات */
export async function refreshIfNeeded(storeUid: string): Promise<SallaAuth | null> {
  const auth = await loadAuth(storeUid);
  if (!auth) return null;
  if (!isExpired(auth)) return auth;

  // لو عندك ريفرش توكن، نادِ backend عندك لإعادة الإصدار
  // ملاحظة: تبادل/تحديث التوكين عادة يكون عبر كول باك OAuth وليس من داخل Merchant APIs
  // هنا نحتفظ بالشكل العام لتكامل مستقبلي
  try {
    // TODO: نفّذ من عندك لو عندك سيرفر OAuth كامل
    // const newAuth = await myRefreshFlow(auth.refresh_token)
    // await saveAuth(storeUid, newAuth)
    return auth; // مؤقتًا نعيد القديم
  } catch {
    return auth;
  }
}

/** طلب عام مع Retry مبسّط على 429/5xx */
export async function sallaFetch(
  storeUid: string,
  path: string,
  init?: RequestInit & { paginate?: boolean }
): Promise<Response> {
  const auth = await refreshIfNeeded(storeUid) || await loadAuth(storeUid);
  if (!auth?.access_token) throw new Error("missing_access_token");

  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${auth.access_token}`,
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };

  let attempt = 0;
  const max = 3;

  while (true) {
    attempt++;
    const res = await fetch(url, { ...init, headers });
    if (res.status < 500 && res.status !== 429) return res;

    if (attempt >= max) return res;
    const retryAfter = Number(res.headers.get("Retry-After") || "0");
    const waitMs = retryAfter > 0 ? retryAfter * 1000 : Math.min(1000 * attempt, 4000);
    await new Promise(r => setTimeout(r, waitMs));
  }
}

/** userinfo: مفيد لتثبيت المتجر وتأكيد الدومين */
export async function fetchUserInfo(storeUid: string): Promise<UnknownRecord> {
  const res = await sallaFetch(storeUid, USERINFO_URL, { method: "GET" });
  if (!res.ok) throw new Error(`userinfo ${res.status}`);
  return res.json() as Promise<UnknownRecord>;
}

/** subscriptions: GET /apps/{app_id}/subscriptions */
export async function fetchAppSubscriptions(storeUid: string): Promise<UnknownRecord> {
  if (!APP_ID) throw new Error("SALLA_APP_ID not configured");
  const res = await sallaFetch(storeUid, `/apps/${APP_ID}/subscriptions`, { method: "GET" });
  if (!res.ok) throw new Error(`subscriptions ${res.status}`);
  return res.json() as Promise<UnknownRecord>;
}
