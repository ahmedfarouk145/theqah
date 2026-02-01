// src/pages/api/store/profile.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { authAdmin, dbAdmin } from "@/lib/firebaseAdmin";

type Ok = { ok: true; storeName: string | null; storeUid: string; platform: string };
type Err = { ok: false; error: string };

async function verify(req: NextApiRequest) {
    const h = req.headers.authorization || "";
    const m = h.match(/^Bearer (.+)$/i);
    const token = m?.[1];
    if (!token) return null;
    try {
        const dec = await authAdmin().verifyIdToken(token);
        return { uid: dec.uid as string, email: (dec.email ?? null) as string | null };
    } catch { return null; }
}

/**
 * Find store by email - searches in userinfo.data.email field
 */
async function findStoreByEmail(email: string): Promise<{ id: string; data: Record<string, unknown> } | null> {
    const db = dbAdmin();

    // Primary: Find stores where meta.userinfo.data.email matches (correct path!)
    try {
        const emailQuery = db.collection('stores')
            .where('meta.userinfo.data.email', '==', email)
            .limit(5);

        const snap = await emailQuery.get();
        if (!snap.empty) {
            const doc = snap.docs[0];
            return { id: doc.id, data: doc.data() };
        }
    } catch {
        // Index might not exist, try alternative
    }

    // Fallback 1: Find stores where top-level email field matches AND salla.connected is true
    try {
        const simpleEmailQuery = db.collection('stores')
            .where('email', '==', email)
            .where('salla.connected', '==', true)
            .limit(1);

        const snap = await simpleEmailQuery.get();
        if (!snap.empty) {
            const doc = snap.docs[0];
            return { id: doc.id, data: doc.data() };
        }
    } catch {
        // Index might not exist
    }

    // Fallback 2: Find stores where email field matches AND zid.connected is true
    try {
        const zidEmailQuery = db.collection('stores')
            .where('email', '==', email)
            .where('zid.connected', '==', true)
            .limit(1);

        const snap = await zidEmailQuery.get();
        if (!snap.empty) {
            const doc = snap.docs[0];
            return { id: doc.id, data: doc.data() };
        }
    } catch {
        // Index might not exist
    }

    return null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<Ok | Err>) {
    try {
        const user = await verify(req);
        if (!user) return res.status(401).json({ ok: false, error: "UNAUTHENTICATED" });

        const db = dbAdmin();

        // 1) Try direct store lookup by Firebase Auth UID
        const storeDoc = await db.collection('stores').doc(user.uid).get();

        if (storeDoc.exists) {
            const data = storeDoc.data() || {};

            // Check if this is an alias pointing to real store
            if (data.storeUid && typeof data.storeUid === 'string') {
                const realDoc = await db.collection('stores').doc(data.storeUid).get();
                if (realDoc.exists) {
                    const realData = realDoc.data() || {};
                    const name = realData.meta?.userinfo?.data?.merchant?.name ??
                        realData.storeName ??
                        realData.salla?.storeName ?? null;
                    return res.status(200).json({
                        ok: true,
                        storeName: name,
                        storeUid: data.storeUid,
                        platform: realData.provider ?? 'salla'
                    });
                }
            }

            // This document IS the store
            const name = data.meta?.userinfo?.data?.merchant?.name ??
                data.storeName ??
                data.salla?.storeName ?? null;
            return res.status(200).json({
                ok: true,
                storeName: name,
                storeUid: user.uid,
                platform: data.provider ?? 'salla'
            });
        }

        // 2) Fallback: Find store by email
        if (user.email) {
            const storeByEmail = await findStoreByEmail(user.email);
            if (storeByEmail) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const storeData = storeByEmail.data as any;
                const meta = storeData?.meta || {};
                const userinfo = meta?.userinfo || {};
                const context = userinfo?.data?.merchant || {};
                const name = context?.name ?? storeData?.storeName ?? storeData?.salla?.storeName ?? null;
                return res.status(200).json({
                    ok: true,
                    storeName: name,
                    storeUid: storeByEmail.id,
                    platform: storeData?.provider ?? 'salla'
                });
            }
        }

        return res.status(404).json({ ok: false, error: "Store not found" });
    } catch (e) {
        return res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
}
