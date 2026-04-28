// src/lib/zid/tokens.ts
//
// Zid OAuth token storage. Tokens live nested under the store doc as
// `zid.tokens` so they share the same lifecycle as the store. Phase 2 of
// the Zid/Salla split: writes go to `zid_stores` via ZidStoreRepository;
// reads fall back to legacy `stores` for any pre-existing Zid store
// whose doc hasn't been touched yet.

import { ZidStoreRepository } from '@/server/repositories/zid-store.repository';

export type ZidTokens = {
  access_token: string;
  authorization?: string; // مهم: بعض نقاط النهاية تتطلبه مع X-Manager-Token
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  expires_at: number; // millis
  scope?: string;
  raw?: unknown;
};

let _repo: ZidStoreRepository | null = null;
function repo(): ZidStoreRepository {
  if (!_repo) _repo = new ZidStoreRepository();
  return _repo;
}

export async function saveZidTokens(uid: string, tokens: ZidTokens) {
  // The Store type's `zid` block doesn't enumerate the `tokens` field —
  // tokens are an OAuth concern carried alongside the store record. Cast
  // through Parameters<> rather than `any`.
  const r = repo();
  await r.set(
    uid,
    {
      zid: { connected: true, tokens, updatedAt: Date.now() },
    } as unknown as Parameters<typeof r.set>[1],
  );
}

export async function getZidTokens(uid: string): Promise<ZidTokens | null> {
  const store = await repo().findById(uid);
  return (store?.zid as { tokens?: ZidTokens } | undefined)?.tokens || null;
}
