// src/server/queue/rate-limit.ts
type Bucket = { cap: number; rps: number; tokens: number; last: number };
const B = new Map<string, Bucket>();

function get(k: string, cap: number, rps: number) {
  const now = Date.now();
  let b = B.get(k);
  if (!b) { b = { cap, rps, tokens: cap, last: now }; B.set(k, b); }
  const dt = Math.max(0, (now - b.last) / 1000);
  b.tokens = Math.min(b.cap, b.tokens + dt * b.rps);
  b.last = now;
  return b;
}
export function take(k: string, cap: number, rps: number, cost = 1) {
  const b = get(k, cap, rps);
  if (b.tokens >= cost) { b.tokens -= cost; return true; }
  return false;
}

export const policy = {
  sms:   { global: { cap: 200, rps: 80 },  store: { cap: 20, rps: 6 },  provider: { cap: 100, rps: 40 } },
  email: { global: { cap: 400, rps: 120 }, store: { cap: 50, rps: 12 }, provider: { cap: 200, rps: 60 } },
};

export const canSend = (storeUid: string, kind: "sms"|"email") => {
  const P = policy[kind];
  const g = take(`${kind}:g`, P.global.cap, P.global.rps);
  const s = take(`${kind}:s:${storeUid}`, P.store.cap, P.store.rps);
  const p = take(`${kind}:p:${kind==="sms"?"oursms":"dmail"}`, P.provider.cap, P.provider.rps);
  return g && s && p;
};
