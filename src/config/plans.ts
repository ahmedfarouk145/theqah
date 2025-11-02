export type PlanId = "STARTER" | "SALES_BOOST" | "EXPANSION";

export interface PlanDef {
  id: PlanId;
  name: string;
  nameEn?: string;
  priceSar: number | null;      // null = بالاتفاق
  priceBeforeDiscount?: number; // السعر قبل الخصم
  invitesPerMonth: number | null; // null = غير محدود/مخصص
  features: string[];
  highlight?: boolean;
}

export const PLANS: Record<PlanId, PlanDef> = {
  STARTER: {
    id: "STARTER",
    name: "باقة الانطلاقة",
    nameEn: "Starter Plan",
    priceSar: 19,
    priceBeforeDiscount: 27,
    invitesPerMonth: 120,
    features: [
      "شارة \"مُشتري موثّق\" بجانب كل تقييم لإثبات مصداقيته",
      "اعتماد التقييمات قبل نشرها من لوحة التحكم",
      "جمع تقييمات حقيقية من عملائك بعد كل عملية شراء",
      "120 دعوة تقييم موثوقة شهريًا",
      "بدون رسوم خفية أو خدمات إضافية داخل الباقة",
    ],
  },
  SALES_BOOST: {
    id: "SALES_BOOST",
    name: "باقة زيادة المبيعات",
    nameEn: "Sales Boost Plan",
    priceSar: 29,
    priceBeforeDiscount: 41,
    invitesPerMonth: 250,
    features: [
      "شارة \"مُشتري موثّق\" بجانب كل تقييم",
      "اعتماد التقييمات قبل نشرها من لوحة التحكم",
      "فلترة ذكية للتقييمات لحجب الألفاظ غير اللائقة تلقائيًا",
      "250 دعوة تقييم موثوقة شهريًا",
      "شارة \"مُشتري موثّق\" تظهر أسفل المنتج لزيادة الثقة وتحفيز الشراء",
    ],
    highlight: true, // الأكثر رواجًا
  },
  EXPANSION: {
    id: "EXPANSION",
    name: "باقة التوسّع",
    nameEn: "Expansion Plan",
    priceSar: 49,
    priceBeforeDiscount: 69,
    invitesPerMonth: 600,
    features: [
      "جميع مزايا باقة زيادة المبيعات",
      "600 دعوة تقييم موثوقة شهريًا",
      "تقارير تحليلية متقدمة لقياس رضا العملاء ونسبة التفاعل",
      "فلترة مطوّرة بمعايير أعلى لجودة المراجعات",
      "إمكانية عرض صفحة عامة تحتوي على جميع تقييمات المتجر بشكل احترافي",
    ],
  },
};

// نافذة شهرية (UTC)
export function getCycleBoundaries(date = new Date()) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0));
  const key = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
  return { startMs: +start, endMs: +end, key };
}

/**
 * تحويل اسم الباقة من Salla إلى المعرف الداخلي
 * يدعم أسماء بالعربية والإنجليزية
 */
export function mapSallaPlanToInternal(planName?: string | null, planType?: string | null): PlanId | null {
  if (!planName) return null;
  
  const normalized = String(planName).toLowerCase().trim();
  
  // دعم الأسماء بالعربية والإنجليزية
  const mapping: Record<string, PlanId> = {
    // أسماء بالعربية
    "انطلاقة": "STARTER",
    "الانطلاقة": "STARTER",
    "باقة الانطلاقة": "STARTER",
    "زيادة المبيعات": "SALES_BOOST",
    "زيادة مبيعات": "SALES_BOOST",
    "باقة زيادة المبيعات": "SALES_BOOST",
    "توسع": "EXPANSION",
    "التوسع": "EXPANSION",
    "باقة التوسع": "EXPANSION",
    "توسّع": "EXPANSION",
    "باقة التوسّع": "EXPANSION",
    // أسماء بالإنجليزية
    "starter": "STARTER",
    "starter plan": "STARTER",
    "sales boost": "SALES_BOOST",
    "sales boost plan": "SALES_BOOST",
    "expansion": "EXPANSION",
    "expansion plan": "EXPANSION",
    // أسماء قديمة (للتوافق مع النظام القديم)
    "start": "STARTER",
    "growth": "SALES_BOOST",
    "scale": "EXPANSION",
  };
  
  // البحث المباشر
  if (mapping[normalized]) {
    return mapping[normalized];
  }
  
  // البحث الجزئي (في حالة وجود كلمات إضافية)
  for (const [key, planId] of Object.entries(mapping)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return planId;
    }
  }
  
  // البحث عن طريق planType
  if (planType) {
    const typeNormalized = String(planType).toLowerCase().trim();
    if (typeNormalized === "starter") return "STARTER";
    if (typeNormalized === "sales_boost" || typeNormalized === "sales-boost") return "SALES_BOOST";
    if (typeNormalized === "expansion") return "EXPANSION";
  }
  
  return null;
}
