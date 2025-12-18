/**
 * Launch Offer Pricing (عرض الإطلاق)
 * Single plan with all features - 1,000 reviews/month
 * 
 * Pricing:
 * - Monthly: 21 SAR/month (30% discount from 30 SAR)
 * - Annual: 210 SAR/year (42% discount, 17.5 SAR/month)
 * 
 * Offer Terms:
 * - Limited time: First 10 days after launch
 * - Fair use: Up to 1,000 reviews/month
 * - Price guarantee: Discount stays as long as subscription is active
 */

export type PlanId = "TRIAL" | "PAID_MONTHLY" | "PAID_ANNUAL";

export interface PlanDef {
  id: PlanId;
  name: string;
  nameEn: string;
  priceSar: number;
  priceBeforeDiscount?: number; // السعر قبل الخصم
  reviewsPerMonth: number;
  billingCycle: 'trial' | 'monthly' | 'annual';
  savingsPercent?: number;
  features: string[];
  highlight?: boolean;
}

export const PLANS: Record<PlanId, PlanDef> = {
  TRIAL: {
    id: "TRIAL",
    name: "تجريبي مجاني",
    nameEn: "Free Trial",
    priceSar: 0,
    reviewsPerMonth: 10,
    billingCycle: 'trial',
    features: [
      "نظام \"مشتري موثق\" كامل للتجربة",
      "توثيق المراجعات مع شارة الثقة",
      "ويدجت قابل للتضمين في المتجر",
      "لوحة تحكم لإدارة المراجعات",
      "10 مراجعات شهرياً للتجربة",
    ],
  },
  PAID_MONTHLY: {
    id: "PAID_MONTHLY",
    name: "الخيار المرن (شهري)",
    nameEn: "Flexible Plan (Monthly)",
    priceSar: 21,
    priceBeforeDiscount: 30,
    reviewsPerMonth: 1000,
    billingCycle: 'monthly',
    savingsPercent: 30,
    features: [
      "✅ نظام \"مشتري موثق\" كامل (توثيق + ويدجت + لوحة تحكم)",
      "✅ حتى 1,000 مراجعة شهرياً",
      "✅ شارة \"مُشتري موثّق\" بجانب كل تقييم",
      "✅ اعتماد التقييمات قبل نشرها من لوحة التحكم",
      "✅ فلترة ذكية للألفاظ غير اللائقة تلقائياً",
      "✅ جمع تقييمات حقيقية من عملائك بعد كل عملية شراء",
      "✅ ويدجت احترافي قابل للتضمين في صفحات المنتجات",
      "✅ تقارير تحليلية لقياس رضا العملاء",
      "💎 خصم 30% (بدلاً من 30 ريال)",
      "🔒 ضمان السعر: خصمك يستمر معك طالما اشتراكك ساري",
    ],
  },
  PAID_ANNUAL: {
    id: "PAID_ANNUAL",
    name: "الخيار الأذكى (سنوي)",
    nameEn: "Smart Plan (Annual)",
    priceSar: 210,
    priceBeforeDiscount: 360,
    reviewsPerMonth: 1000,
    billingCycle: 'annual',
    savingsPercent: 42,
    features: [
      "✅ جميع مزايا الخيار الشهري",
      "✅ حتى 1,000 مراجعة شهرياً",
      "💰 وفّر 42% - الشهر بـ 17.5 ريال فقط!",
      "💎 دفع سنوي: 210 ريال للسنة كاملة",
      "🎁 وفّرت 150 ريال في السنة",
      "🔒 ضمان السعر: خصمك يستمر معك طالما اشتراكك ساري",
      "⚡ الخيار الأوفر والأذكى!",
    ],
    highlight: true, // الأكثر رواجًا
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
 * 
 * Launch offer: Single paid plan with two billing cycles
 */
export function mapSallaPlanToInternal(planName?: string | null, billingCycle?: 'monthly' | 'annual' | null): PlanId | null {
  if (!planName) return null;
  
  const normalized = String(planName).toLowerCase().trim();
  
  // دعم الأسماء بالعربية والإنجليزية
  const mapping: Record<string, PlanId> = {
    // نظام جديد (عرض الإطلاق)
    "تجريبي": "TRIAL",
    "trial": "TRIAL",
    "free trial": "TRIAL",
    "مجاني": "TRIAL",
    
    // الباقة المدفوعة (حسب دورة الفوترة)
    "مدفوع": billingCycle === 'annual' ? "PAID_ANNUAL" : "PAID_MONTHLY",
    "paid": billingCycle === 'annual' ? "PAID_ANNUAL" : "PAID_MONTHLY",
    "شهري": "PAID_MONTHLY",
    "monthly": "PAID_MONTHLY",
    "الخيار المرن": "PAID_MONTHLY",
    "سنوي": "PAID_ANNUAL",
    "annual": "PAID_ANNUAL",
    "yearly": "PAID_ANNUAL",
    "الخيار الأذكى": "PAID_ANNUAL",
    
    // أسماء قديمة (للتوافق مع النظام القديم - تحويل للباقة المدفوعة)
    "انطلاقة": "PAID_MONTHLY",
    "starter": "PAID_MONTHLY",
    "زيادة المبيعات": "PAID_MONTHLY",
    "sales boost": "PAID_MONTHLY",
    "توسع": "PAID_ANNUAL",
    "expansion": "PAID_ANNUAL",
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
  
  // افتراضي: إذا لم يتم تحديد، استخدم الشهري
  return billingCycle === 'annual' ? "PAID_ANNUAL" : "PAID_MONTHLY";
}
