// src/lib/sallaClient.ts
export type Json = Record<string, unknown>;

/** /admin/v2/store/info */
export interface StoreInfoResponse {
  status?: number;
  success?: boolean;
  data?: {
    id?: number;
    name?: string;
    type?: string;
    status?: string;
    plan?: string;
    currency?: string;
    domain?: string; // نقرأه ونطبّعه في الويبهوك
  };
}

/** /oauth2/user/info — الحد الأدنى اللي نحتاجه للإيميل/اسم المتجر/الدومين */
export interface UserInfoResponse {
  email?: string;
  user?: {
    email?: string;
    name?: string;
    id?: number;
  };
  merchant?: {
    id?: number;
    name?: string;
    email?: string;
    domain?: string;
    url?: string;
  };
  store?: {
    id?: number;
    name?: string;
    domain?: string;
    url?: string;
    type?: string; // demo...
  };
  domain?: string;
  url?: string;
}

export async function fetchStoreInfo(accessToken: string): Promise<StoreInfoResponse> {
  const resp = await fetch("https://api.salla.dev/admin/v2/store/info", {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) throw new Error(`store/info ${resp.status}`);
  return (await resp.json()) as StoreInfoResponse;
}

export async function fetchUserInfo(accessToken: string): Promise<UserInfoResponse> {
  const resp = await fetch("https://accounts.salla.sa/oauth2/user/info", {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) throw new Error(`userinfo ${resp.status}`);
  return (await resp.json()) as UserInfoResponse;
}

/** احصل على access_token من owners/{storeUid} لو موجود */
export async function getOwnerAccessToken(
  db: FirebaseFirestore.Firestore,
  storeUid: string
): Promise<string | null> {
  try {
    const doc = await db.collection("owners").doc(storeUid).get();
    const data = doc.data() as Json | undefined;
    const oauth = (data?.oauth ?? {}) as Json;
    const token = typeof oauth["access_token"] === "string" ? (oauth["access_token"] as string) : null;
    return token && token.trim() ? token : null;
  } catch {
    return null;
  }
}

export async function fetchAppSubscriptions(storeUid: string): Promise<unknown> {
  // مثال: استدعاء API سلة لجلب الاشتراكات
  // يمكنك تعديل الرابط حسب توثيق سلة
  const url = `https://api.salla.dev/admin/v2/stores/${encodeURIComponent(storeUid)}/subscriptions`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${process.env.SALLA_API_TOKEN}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`Failed to fetch subscriptions: ${res.status}`);
  return await res.json();
}
