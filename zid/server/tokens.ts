import { dbAdmin } from '@/lib/firebaseAdmin';

export type ZidTokens = {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  expires_at: number; // millis
  scope?: string;
  raw?: unknown;
};

type StoreDoc = {
  zid?: {
    connected?: boolean;
    tokens?: ZidTokens;
    updatedAt?: number;
  };
};

export async function saveZidTokens(uid: string, tokens: ZidTokens) {
  const db = dbAdmin();
  await db.collection('stores').doc(uid).set(
    {
      zid: { connected: true, tokens, updatedAt: Date.now() },
    },
    { merge: true }
  );
}

export async function getZidTokens(uid: string): Promise<ZidTokens | null> {
  const db = dbAdmin();
  const snap = await db.collection('stores').doc(uid).get();
  const data = snap.data() as StoreDoc | undefined;
  return data?.zid?.tokens || null;
}
