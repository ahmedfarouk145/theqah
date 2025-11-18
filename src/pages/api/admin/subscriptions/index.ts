import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";
import type { Firestore } from "firebase-admin/firestore";

// ====== Types ======
type UnknownRecord = Record<string, unknown>;
type PlanId = "STARTER" | "SALES_BOOST" | "EXPANSION" | string;

interface StoreDoc {
  uid?: string;
  provider?: string;
  updatedAt?: number;
  domain?: { base?: string; key?: string; updatedAt?: number };
  salla?: { installed?: boolean; connected?: boolean; storeId?: number | string; domain?: string };
  subscription?: {
    planId?: PlanId;
    raw?: UnknownRecord;
    syncedAt?: number;
    updatedAt?: number;
  };
  usage?: {
    monthKey?: string; // "YYYY-MM"
    invitesUsed?: number;
    updatedAt?: number;
  };
}

interface ApiStoreItem {
  storeUid: string;
  domainBase?: string;
  planId?: PlanId;
  invitesUsed?: number;
    invitesLimit?: number;
  status: "active" | "over_quota" | "lapsed" | "no_plan";
  sallaInstalled?: boolean;
  sallaConnected?: boolean;
  lastUpdate?: number;
}

// ====== Plans (الباقات الجديدة) ======
const PLAN_LIMITS: Record<PlanId, number> = {
  STARTER: 100,     // باقة الانطلاقة (19 ريال)
  SALES_BOOST: 250, // باقة زيادة المبيعات (29 ريال)
  EXPANSION: 600,   // باقة التوسع (49 ريال)
  // الباقات القديمة (للتوافق)
  P30: 100,         // مرادف لـ STARTER
  P60: 250,         // مرادف لـ SALES_BOOST
  P120: 600,        // مرادف لـ EXPANSION
};

function getInvitesLimit(planId?: PlanId): number {
  if (!planId) return 0;
  return PLAN_LIMITS[planId] ?? 0;
}

function monthKey(ts: number = Date.now()): string {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/**
 * احتساب حالة المتجر:
 * - no_plan: لا يوجد planId
 * - over_quota: الاستخدام الحالي >= الحد الشهري
 * - active: هناك خطة وحد لم يتجاوز
 * - lapsed: خطة موجودة لكن مؤشرات توحي بعدم التجديد (syncedAt قديم > 35 يوم مثلًا)
 */
function deriveStatus(store: StoreDoc, invitesUsed: number): ApiStoreItem["status"] {
  const planId = store.subscription?.planId as PlanId | undefined;
  if (!planId) return "no_plan";

  const limit = getInvitesLimit(planId);

  // اعتبار الاشتراك "منتهي/متوقف" لو sync قديم جدًا (>35 يوم)
  const syncedAt = store.subscription?.syncedAt ?? store.subscription?.updatedAt;
  const stale = typeof syncedAt === "number" ? (Date.now() - syncedAt > 35 * 24 * 60 * 60 * 1000) : true;
  if (stale) return "lapsed";

  if (invitesUsed >= limit) return "over_quota";
  return "active";
}

/**
 * محاولة الحصول على invitesUsed للشهر الحالي:
 * 1) من store.usage إن وُجد.
 * 2) وإلا: نحسب تقريبًا من review_invites خلال الشهر (Query لكل متجر).
 */
async function getInvitesUsedForThisMonth(db: Firestore, storeUid: string, fallbackToScan = true): Promise<number> {
  // 1) من حقل usage
  const doc = await db.collection("stores").doc(storeUid).get();
  const data = (doc.data() || {}) as StoreDoc;
  if (data.usage?.monthKey === monthKey() && typeof data.usage?.invitesUsed === "number") {
    return data.usage.invitesUsed!;
  }

  if (!fallbackToScan) return 0;

  // 2) مسح review_invites للشهر الحالي (تقريب)
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const startTs = start.getTime();

  const snap = await db.collection("review_invites")
    .where("storeUid", "==", storeUid)
    .where("sentAt", ">=", startTs)
    .get();

  return snap.size;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // حماية بسيطة (اختياري): GET فقط، وتستطيع لاحقًا ربطها بـ Admin Auth
  if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });

  const db = dbAdmin();

  // يمكنك التصفية/التقسيم صفحات لو عندك عدد كبير
  const storesSnap = await db.collection("stores")
    .where("provider", "==", "salla")
    .limit(200)
    .get();

  const out: ApiStoreItem[] = [];

  for (const d of storesSnap.docs) {
    const s = (d.data() || {}) as StoreDoc;
    const storeUid = s.uid || d.id;
    const domainBase = s.domain?.base || s.salla?.domain;
    const planId = s.subscription?.planId as PlanId | undefined;
    const invitesLimit = getInvitesLimit(planId);
    const invitesUsed = await getInvitesUsedForThisMonth(db, storeUid, true);

    out.push({
      storeUid,
      domainBase,
      planId,
      invitesUsed,
      invitesLimit,
      status: deriveStatus(s, invitesUsed),
      sallaInstalled: !!s.salla?.installed,
      sallaConnected: !!s.salla?.connected,
      lastUpdate: s.updatedAt,
    });
  }

  // مجموعات جاهزة للواجهة
  const grouped = {
    active: out.filter(x => x.status === "active"),
    over_quota: out.filter(x => x.status === "over_quota"),
    lapsed: out.filter(x => x.status === "lapsed"),
    no_plan: out.filter(x => x.status === "no_plan"),
    all: out,
  };

  return res.status(200).json({ ok: true, grouped, count: out.length, month: monthKey() });
}
