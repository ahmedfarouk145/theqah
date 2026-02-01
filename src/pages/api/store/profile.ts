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
 * Find store by email - searches in userinfo and email fields
 */
async function findStoreByEmail(email: string): Promise<{ id: string; data: Record<string, unknown> } | null> {
    const db = dbAdmin();
    console.log('[STORE_PROFILE] findStoreByEmail called with:', email);

    // First try: Find stores where userinfo.data.context.email matches
    try {
        // DIAGNOSTIC: Try to fetch known store directly
        console.log('[STORE_PROFILE] DIAGNOSTIC: Trying to fetch salla:1949259124 directly');
        const knownStore = await db.collection('stores').doc('salla:1949259124').get();
        console.log('[STORE_PROFILE] DIAGNOSTIC: salla:1949259124 exists=', knownStore.exists);
        if (knownStore.exists) {
            const data = knownStore.data() || {};
            // Log the actual structure to find where email is
            console.log('[STORE_PROFILE] DIAGNOSTIC: Top-level keys=', Object.keys(data));
            console.log('[STORE_PROFILE] DIAGNOSTIC: data.email=', data.email);
            console.log('[STORE_PROFILE] DIAGNOSTIC: data.salla=', JSON.stringify(data.salla));
            console.log('[STORE_PROFILE] DIAGNOSTIC: data.meta keys=', data.meta ? Object.keys(data.meta) : 'no meta');
            const storedEmail = data?.meta?.userinfo?.data?.context?.email;
            console.log('[STORE_PROFILE] DIAGNOSTIC: stored email at meta.userinfo.data.context.email=', storedEmail);
        }

        console.log('[STORE_PROFILE] Query 1: meta.userinfo.data.context.email ==', email);
        // Try simpler query without orderBy first
        const emailQuery = db.collection('stores')
            .where('meta.userinfo.data.context.email', '==', email)
            .limit(5);

        const snap = await emailQuery.get();
        console.log('[STORE_PROFILE] Query 1 result: empty=', snap.empty, 'size=', snap.size);
        if (!snap.empty) {
            // Log all found docs
            snap.docs.forEach(d => console.log('[STORE_PROFILE] Query 1 found doc:', d.id));
            const doc = snap.docs[0];
            console.log('[STORE_PROFILE] Query 1 returning store:', doc.id);
            return { id: doc.id, data: doc.data() };
        }
    } catch (err) {
        console.log('[STORE_PROFILE] Query 1 error:', err);
        // Index might not exist, try alternative
    }

    // Second try: Find stores where email field matches AND salla.connected is true
    try {
        console.log('[STORE_PROFILE] Query 2: email ==', email, '+ salla.connected == true');
        const simpleEmailQuery = db.collection('stores')
            .where('email', '==', email)
            .where('salla.connected', '==', true)
            .limit(1);

        const snap = await simpleEmailQuery.get();
        console.log('[STORE_PROFILE] Query 2 result: empty=', snap.empty, 'size=', snap.size);
        if (!snap.empty) {
            const doc = snap.docs[0];
            console.log('[STORE_PROFILE] Query 2 found store:', doc.id);
            return { id: doc.id, data: doc.data() };
        }
    } catch (err) {
        console.log('[STORE_PROFILE] Query 2 error:', err);
        // Index might not exist
    }

    // Third try: Find stores where email field matches AND zid.connected is true
    try {
        console.log('[STORE_PROFILE] Query 3: email ==', email, '+ zid.connected == true');
        const zidEmailQuery = db.collection('stores')
            .where('email', '==', email)
            .where('zid.connected', '==', true)
            .limit(1);

        const snap = await zidEmailQuery.get();
        console.log('[STORE_PROFILE] Query 3 result: empty=', snap.empty, 'size=', snap.size);
        if (!snap.empty) {
            const doc = snap.docs[0];
            console.log('[STORE_PROFILE] Query 3 found store:', doc.id);
            return { id: doc.id, data: doc.data() };
        }
    } catch (err) {
        console.log('[STORE_PROFILE] Query 3 error:', err);
        // Index might not exist
    }

    console.log('[STORE_PROFILE] No store found by email');
    return null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<Ok | Err>) {
    try {
        const user = await verify(req);
        if (!user) return res.status(401).json({ ok: false, error: "UNAUTHENTICATED" });

        console.log('[STORE_PROFILE] User authenticated:', { uid: user.uid, email: user.email });

        const db = dbAdmin();

        // 1) Try direct store lookup by Firebase Auth UID
        console.log('[STORE_PROFILE] Step 1: Looking for store by uid:', user.uid);
        const storeDoc = await db.collection('stores').doc(user.uid).get();
        console.log('[STORE_PROFILE] Step 1 result: exists=', storeDoc.exists);

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
