// src/lib/zid/fetch.ts
import { ensureZidAccessToken } from '@/lib/zid/auth';

export async function zidFetch<T>(uid: string, path: string, init?: RequestInit): Promise<T> {
  const tokens = await ensureZidAccessToken(uid);

  const r = await fetch(`https://api.zid.sa${path}`, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      'Authorization': tokens.authorization ? `Bearer ${tokens.authorization}` : `Bearer ${tokens.access_token}`,
      'X-Manager-Token': tokens.access_token, // مهم حسب الدوكيومنت
      'Content-Type': 'application/json',
    },
  });

  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`Zid API error ${r.status}: ${text}`);
  }
  return r.json() as Promise<T>;
}
