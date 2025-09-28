export type PlanId = "TRIAL" | "P30" | "P60" | "P120" | "ELITE";

export interface PlanDef {
  id: PlanId;
  name: string;
  priceSar: number | null;      // null = بالاتفاق
  invitesPerMonth: number | null; // null = غير محدود/مخصص
  features: string[];
  highlight?: boolean;
}

export const PLANS: Record<PlanId, PlanDef> = {
  TRIAL: {
    id: "TRIAL",
    name: "باقة التجربة",
    priceSar: 0,
    invitesPerMonth: 5,
    features: ["5 دعوات مجانية", "تجربة كاملة للميزات الأساسية"],
  },
  P30: {
    id: "P30",
    name: "باقة البداية",
    priceSar: 30,
    invitesPerMonth: 40,
    features: ["40 دعوة شهريًا", "مثالية للمتاجر الصغيرة أو الجديدة"],
  },
  P60: {
    id: "P60",
    name: "باقة النمو",
    priceSar: 60,
    invitesPerMonth: 90,
    features: ["90 دعوة شهريًا", "مضاعفة التقييمات وتعزيز الثقة"],
    highlight: true,
  },
  P120: {
    id: "P120",
    name: "باقة التوسع",
    priceSar: 120,
    invitesPerMonth: 200,
    features: ["200 دعوة شهريًا", "للشركات المتوسطة والكبيرة"],
  },
  ELITE: {
    id: "ELITE",
    name: "باقة النخبة",
    priceSar: null,
    invitesPerMonth: 500, // نقطة بداية — قابل للتخصيص
    features: ["بداية من 500 دعوة", "دعم مخصص وتقارير تفصيلية", "إدارة احترافية"],
  },
};

// نافذة شهرية (UTC)
export function getCycleBoundaries(date = new Date()) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0));
  const key = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
  return { startMs: +start, endMs: +end, key };
}

export function mapSallaPlanToInternal(planName?: string | null, planType?: string | null): string {
  // مثال: يمكنك تخصيص المنطق حسب خططك الداخلية
  if (!planName) return "free";
  if (planName.includes("Pro")) return "pro";
  if (planName.includes("Plus")) return "plus";
  if (planType === "enterprise") return "enterprise";
  return "free";
}
