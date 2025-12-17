// src/pages/api/admin/subscription.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";
import { fetchAppSubscriptions } from "@/lib/sallaClient";
import { mapSallaPlanToInternal } from "@/config/plans";
import { requireAdmin } from "@/server/auth/requireAdmin"; // مهم: يتأكد إن اللي بينادي أدمن

const TTL_MS = 6 * 60 * 60 * 1000; // 6 ساعات

type SubState = { raw?: unknown; syncedAt?: number; planId?: string | null } | undefined;

export const config = {
  api: { bodyParser: false }, // مش محتاجين body هنا، وكمان أسرع
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // 1) السماح بـ GET فقط + التحقق من صلاحيات الأدمن
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }
  const auth = await requireAdmin(req);
  if (!auth || !auth.uid) return res.status(403).json({ ok: false, error: "unauthorized" });

  // 2) قراءة params
  const storeUid = typeof req.query.storeUid === "string" ? req.query.storeUid.trim() : "";
  const force = req.query.force === "1" || req.query.force === "true";
  if (!storeUid) return res.status(400).json({ ok: false, error: "missing_storeUid" });

  // 3) جِب حالة الاشتراك الحالية
  const db = dbAdmin();
  const ref = db.collection("stores").doc(storeUid);
  const snap = await ref.get();
  const cur = (snap.exists ? (snap.data()?.subscription as SubState) : undefined) || {};
  const lastSynced = typeof cur.syncedAt === "number" ? cur.syncedAt : 0;
  const isFresh = !force && lastSynced > 0 && Date.now() - lastSynced < TTL_MS;

  // Helper للردّ القياسي
  const reply = (payload: Record<string, unknown>, cached = false) => {
    // Cache control: اسمح بتخزين النتيجة في المتصفح لدقائق قليلة مع revalidate سريع
    res.setHeader("Cache-Control", "private, max-age=60, must-revalidate");
    return res.status(200).json({ ok: true, ...payload, cached });
  };

  // لو مش سلة: ما نقدرش نعمل مزامنة خارجية، رجّع المخزّن فقط
  if (!storeUid.startsWith("salla:")) {
    return reply({ subscription: cur ?? null }, true);
  }

  // 4) لو الحالة حديثة وكافية، رجّع الكاش
  if (isFresh) {
    return reply({ subscription: cur ?? null }, true);
  }

  // 5) محاولة مزامنة من سلة
  try {
    const raw: unknown = await fetchAppSubscriptions(storeUid);

    // استخلص أول عنصر من الردّ بأمان
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
    const arr = Array.isArray((raw as any)?.data)
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (raw as any).data
      : Array.isArray(raw)
      //eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (raw as any)
      : [];

    const first = Array.isArray(arr) && arr.length ? arr[0] : null;
    const planName: string | null = first?.plan_name ?? first?.name ?? null;
    const planType: string | null = first?.plan_type ?? null;

    // حوّل لخطة داخلية
    const nextPlanId = mapSallaPlanToInternal(planName, planType) ?? null;

    // 6) تجنّب الكتابة لو مافيش تغيير
    const samePlan = (cur?.planId ?? null) === nextPlanId;
    const sameSnapshot = JSON.stringify(cur?.raw ?? null) === JSON.stringify(raw ?? null);

    if (!samePlan || !sameSnapshot) {
      await ref.set(
        {
          subscription: { raw, syncedAt: Date.now(), planId: nextPlanId },
          updatedAt: Date.now(),
        },
        { merge: true }
      );
    } else {
      // لو نفس البيانات، حدّث syncedAt بس لتجديد الكاش منطقيًا
      await ref.set(
        {
          subscription: { ...cur, syncedAt: Date.now() },
          updatedAt: Date.now(),
        },
        { merge: true }
      );
    }

    return reply({ subscription: { planId: nextPlanId, raw } });
  } catch (e) {
    // 7) سجّل الخطأ ولا تُسقط الواجهة — ارجع آخر حالة موجودة
    const msg = e instanceof Error ? e.message : String(e);
    await db
      .collection("webhook_errors")
      .add({ at: Date.now(), scope: "subscription_fetch", storeUid, error: msg })
      .catch((err) => {
        console.error('[Subscription] Failed to delete old subscription doc:', err);
      });
    return res.status(200).json({
      ok: true,
      subscription: cur ?? null,
      stale: true,
      warn: "fetch_failed",
      message: msg,
    });
  }
}
