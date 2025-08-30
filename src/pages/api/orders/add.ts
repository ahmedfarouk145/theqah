// src/pages/api/orders/add.ts
import type { NextApiRequest, NextApiResponse } from "next";
import admin from "firebase-admin";               // ⬅️ جديد: للـ serverTimestamp
import { dbAdmin } from "@/lib/firebaseAdmin";
import { verifyUser } from "@/utils/verifyUser";

type Body = {
  orderId: string;
  storeUid: string;
  productId: string;
  customer?: {
    name?: string;
    phone?: string;
    email?: string;
  };
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });

    // 1) Auth
    const { uid } = await verifyUser(req);

    // 2) Validate
    const { orderId, storeUid, productId, customer } = (req.body ?? {}) as Partial<Body>;
    if (!orderId || !storeUid || !productId) {
      return res.status(400).json({ ok: false, error: "MISSING_FIELDS" });
    }

    const db = dbAdmin();

    // 3) المتجر + ملكية
    const storeRef = db.collection("stores").doc(String(storeUid));
    const storeSnap = await storeRef.get();
    if (!storeSnap.exists) return res.status(404).json({ ok: false, error: "STORE_NOT_FOUND" });

    const storeData = storeSnap.data() || {};
    const ownerUids: string[] = Array.isArray(storeData.ownerUids) ? storeData.ownerUids : [];
    const isOwner = storeUid === uid || ownerUids.includes(uid);
    if (!isOwner) return res.status(403).json({ ok: false, error: "NOT_STORE_OWNER" });

    // 4) بيانات الطلب الموحّدة (تُستخدم في الجذري + الساب-كولكشن)
    const orderDoc = {
      orderId: String(orderId),
      storeUid: String(storeUid),
      storeName: String(storeData.name || storeData.storeName || "متجرك"),
      productId: String(productId),
      name: customer?.name ?? null,
      phone: customer?.phone ?? null,
      email: customer?.email ?? null,
      status: "created",
      reviewSent: false,
      reviewLink: null as string | null,
      reviewTokenId: null as string | null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAtMs: Date.now(), // للفرز السريع عدديًا لو حبيت
    };

    // 5) كتابة مزدوجة (batch): nested + root
    const batch = db.batch();
    const nestedRef = storeRef.collection("orders").doc(String(orderId));
    const rootRef = db.collection("orders").doc(String(orderId));
    batch.set(nestedRef, orderDoc, { merge: true });
    batch.set(rootRef,  orderDoc, { merge: true });
    await batch.commit();

    return res.status(201).json({
      ok: true,
      id: String(orderId),
      locations: {
        root: `orders/${orderId}`,
        nested: `stores/${storeUid}/orders/${orderId}`,
      },
    });
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    const status = Number(e?.status) || 500;
    const message = e?.message || "INTERNAL";
    console.error("orders/add error:", message);
    return res.status(status).json({ ok: false, error: message });
  }
}
