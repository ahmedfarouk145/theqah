import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";
import { verifyStore, type AuthedRequest } from "@/utils/verifyStore";

const FALLBACK_API_BASE = (process.env.SALLA_API_BASE || "https://api.salla.sa").replace(/\/+$/, "");

// (اختياري) محاولة إلغاء الاشتراكات لو API يسمح — نبقيها لينة ولا نفشل الطلب عند الخطأ
async function tryCleanupWebhooks(params: {
  apiBase: string;
  accessToken?: string | null;
  sinkUrl: string;
}) {
  const { apiBase, accessToken, sinkUrl } = params;
  if (!accessToken) return;

  // ملاحظة: نقاط حذف/قائمة الاشتراكات قد تختلف بين البيئات/الإصدارات.
  // نحاول أفضل جهد: لو فيه endpoint لـ "subscriptions" بنسحبه ونحذف كل ما يطابق الـ sinkUrl.
  try {
    const list = await fetch(`${apiBase}/admin/v2/webhooks/subscriptions`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const text = await list.text();
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      /* ignore */
    }
    const subs: Array<{ id: number; url?: string }> = data?.data || [];
    const toDelete = subs.filter((s) => (s.url || "").trim() === sinkUrl.trim());

    // نحذف واحد-واحد (لو فيه endpoint /unsubscribe)
    for (const s of toDelete) {
      try {
        await fetch(`${apiBase}/admin/v2/webhooks/unsubscribe`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ id: s.id }),
        });
      } catch {
        // تجاهل
      }
    }
  } catch {
    // تجاهل أي خطأ هنا — لا نفشل عملية الفصل
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method Not Allowed" });

    // نتحقق من مالك المتجر (نفس آلية /api/store/settings)
    try {
      await verifyStore(req);
    } catch (e) {
      const err = e as Error & { status?: number };
      return res.status(err.status ?? 401).json({ ok: false, error: err.message || "Unauthorized" });
    }

    const { storeId } = req as AuthedRequest; // هذا هو ownerUid
    if (!storeId) return res.status(400).json({ ok: false, error: "Missing storeId" });

    const db = dbAdmin();

    // نجيب مستند منصة سلة الخاص بهذا المالك
    const storeSnap = await db
      .collection("stores")
      .where("platform", "==", "salla")
      .where("ownerUid", "==", storeId)
      .limit(1)
      .get();

    if (storeSnap.empty) {
      // لا يوجد ربط
      return res.status(200).json({ ok: true, already: true });
    }

    const storeDoc = storeSnap.docs[0];
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
    const storeData = storeDoc.data() as any;
    const uid: string = storeData?.uid || storeDoc.id; // غالبًا "salla:STORE_ID"
    const apiBase = (storeData?.salla?.apiBase || FALLBACK_API_BASE).replace(/\/+$/, "");

    // نقرأ التوكنات لمحاولة تنظيف الاشتراكات
    const tokenSnap = await db.collection("salla_tokens").doc(uid).get();
    const accessToken: string | undefined = tokenSnap.exists ? (tokenSnap.data()?.accessToken as string | undefined) : undefined;

    const base =
      (process.env.APP_BASE_URL ||
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.NEXT_PUBLIC_BASE_URL ||
        "").replace(/\/+$/, "");
    const token = (process.env.SALLA_WEBHOOK_TOKEN || "").trim();
    const sinkUrl = `${base}/api/salla/webhook${token ? `?t=${encodeURIComponent(token)}` : ""}`;

    // (اختياري) نحاول إزالة الاشتراكات المرتبطة بـ sinkUrl
    await tryCleanupWebhooks({ apiBase, accessToken: accessToken || null, sinkUrl });

    // 1) تعطيل حالة الربط في stores
    await storeDoc.ref.set(
      {
        salla: {
          //eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...((storeData?.salla as any) || {}),
          connected: false,
          uninstalledAt: Date.now(),
        },
        updatedAt: Date.now(),
      },
      { merge: true }
    );

    // 2) إبطال التوكنات (لا نحذف الوثيقة بالكامل للحفاظ على التعقّب والسجل)
    if (tokenSnap.exists) {
      await tokenSnap.ref.set(
        {
          revokedAt: Date.now(),
          accessToken: null,
          refreshToken: null,
        },
        { merge: true }
      );
    }

    return res.status(200).json({ ok: true });
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}
