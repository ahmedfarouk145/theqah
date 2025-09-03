// src/lib/salla-admin.ts
const SALLA_API_BASE = process.env.SALLA_API_BASE || "https://api.salla.dev";

type AdminRequestOpts = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body?: string | undefined;
};

export function sallaAdminClient(accessToken: string) {
  return async function <T = unknown>(path: string, opts: AdminRequestOpts = {}): Promise<T> {
    const url = `${SALLA_API_BASE.replace(/\/+$/, "")}/admin/v2/${path.replace(/^\/+/, "")}`;
    const res = await fetch(url, {
      method: opts.method || "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...(opts.headers || {}),
      },
      body: opts.body,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = typeof json === "object" ? JSON.stringify(json) : String(json);
      throw new Error(`salla_admin_${res.status}: ${msg}`);
    }
    return json as T;
  };
}
