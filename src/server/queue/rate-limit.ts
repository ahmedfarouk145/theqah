type BucketKey = string;

type Bucket = {
  capacity: number;
  refillPerSec: number;
  tokens: number;
  lastRefill: number;
};

const BUCKETS = new Map<BucketKey, Bucket>();

function getOrCreate(key: BucketKey, capacity: number, refillPerSec: number): Bucket {
  let b = BUCKETS.get(key);
  const now = Date.now();
  if (!b) {
    b = { capacity, refillPerSec, tokens: capacity, lastRefill: now };
    BUCKETS.set(key, b);
  }
  const elapsedSec = Math.max(0, (now - b.lastRefill) / 1000);
  const refill = elapsedSec * b.refillPerSec;
  if (refill > 0) {
    b.tokens = Math.min(b.capacity, b.tokens + refill);
    b.lastRefill = now;
  }
  return b;
}

export function tryConsume(key: string, capacity: number, refillPerSec: number, cost = 1): boolean {
  const b = getOrCreate(key, capacity, refillPerSec);
  if (b.tokens >= cost) {
    b.tokens -= cost;
    return true;
  }
  return false;
}

export const RatePolicy = {
  sms: {
    global: { capacity: 200, rps: 80 },
    perStore: { capacity: 20, rps: 6 },
    provider: { capacity: 100, rps: 40 },
  },
  email: {
    global: { capacity: 400, rps: 120 },
    perStore: { capacity: 50, rps: 12 },
    provider: { capacity: 200, rps: 60 },
  },
};

export function canSendSMS(storeUid: string) {
  const okG = tryConsume("sms:global", RatePolicy.sms.global.capacity, RatePolicy.sms.global.rps);
  const okS = tryConsume(`sms:store:${storeUid}`, RatePolicy.sms.perStore.capacity, RatePolicy.sms.perStore.rps);
  const okP = tryConsume("sms:provider:oursms", RatePolicy.sms.provider.capacity, RatePolicy.sms.provider.rps);
  return okG && okS && okP;
}

export function canSendEmail(storeUid: string) {
  const okG = tryConsume("email:global", RatePolicy.email.global.capacity, RatePolicy.email.global.rps);
  const okS = tryConsume(`email:store:${storeUid}`, RatePolicy.email.perStore.capacity, RatePolicy.email.perStore.rps);
  const okP = tryConsume("email:provider:dmail", RatePolicy.email.provider.capacity, RatePolicy.email.provider.rps);
  return okG && okS && okP;
}
