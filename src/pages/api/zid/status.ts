// src/pages/api/zid/status.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { initFirebaseAdminIfNeeded } from "@/server/firebase-admin";

type StoreDoc = {
  zid?: {
    connected?: boolean;
    tokens?: {
      access_token?: string;
      expires_at?: number;
      refresh_token?: string;
    };
  };
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method Not Allowed" });
  try {
    initFirebaseAdminIfNeeded();

    const idToken = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!idToken) return res.status(401).json({ error: "unauthenticated" });

    const decoded = await getAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded?.uid) return res.status(401).json({ error: "invalid_token" });

    const db = getFirestore();
    const storeRef = db.collection("stores").doc(decoded.uid);
    const snap = await storeRef.get();
    const store = (snap.data() || {}) as StoreDoc;

    const connected = Boolean(store?.zid?.connected);
    const expiresAt = store?.zid?.tokens?.expires_at ?? null;

    return res.status(200).json({ connected, expiresAt });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ error: "internal_error", message: msg });
  }
}
