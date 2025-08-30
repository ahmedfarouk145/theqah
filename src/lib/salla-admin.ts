// src/lib/salla-admin.ts
const SALLA_ADMIN_API = "https://api.salla.dev/admin";

export type SallaAdminClient = <T = unknown>(path: string, init?: RequestInit) => Promise<T>;

export function sallaAdminClient(accessToken: string): SallaAdminClient {
  if (!accessToken) throw new Error("Salla admin token is required");
  return async function <T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers || {});
    headers.set("Authorization", `Bearer ${accessToken}`);
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");

    const res = await fetch(`${SALLA_ADMIN_API}${path}`, { ...init, headers });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Salla Admin API ${res.status}: ${text || res.statusText}`);
    }
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      return (await res.json()) as T;
    }
    // برجع undefined بنوع آمن بدون ts-expect-error
    return (undefined as unknown) as T;
  };
}
