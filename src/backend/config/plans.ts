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
    name: "Unlimited Growth Plan",
    nameEn: "Unlimited Growth Plan",
    priceSar: 21,
    priceBeforeDiscount: 30,
    reviewsPerMonth: -1, // Unlimited
    billingCycle: 'monthly',
    savingsPercent: 30,
    features: [
      "✅ Unlimited verified reviews",
      "✅ 24 Hour Automated AI protection",
      "✅ Instant Verified Buyer badge",
      "✅ Comprehensive customer dashboard",
      "✅ Instant activation",
      "💎 30% Off (was 30 SAR)",
    ],
  },
  PAID_ANNUAL: {
    id: "PAID_ANNUAL",
    name: "Founders Annual Plan",
    nameEn: "Founders Annual Plan",
    priceSar: 210,
    priceBeforeDiscount: 360,
    reviewsPerMonth: -1, // Unlimited
    billingCycle: 'annual',
    savingsPercent: 42,
    features: [
      "✅ Unlimited verified reviews",
      "✅ 24 Hour Automated AI protection",
      "✅ Instant Verified Buyer badge",
      "✅ Comprehensive customer dashboard",
      "✅ Instant activation",
      "⭐ Priority support for early subscribers",
      "🔒 Price locked in for founders",
      "💰 Best value - 17.5 SAR/month!",
    ],
    highlight: true,
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
    // Trial plan
    "تجريبي": "TRIAL",
    "trial": "TRIAL",
    "free trial": "TRIAL",
    "مجاني": "TRIAL",

    // New plan names (current branding)
    "unlimited growth plan": "PAID_MONTHLY",
    "unlimited growth": "PAID_MONTHLY",
    "founders annual plan": "PAID_ANNUAL",
    "founders annual": "PAID_ANNUAL",
    "founders": "PAID_ANNUAL",

    // Billing cycle based
    "مدفوع": billingCycle === 'annual' ? "PAID_ANNUAL" : "PAID_MONTHLY",
    "paid": billingCycle === 'annual' ? "PAID_ANNUAL" : "PAID_MONTHLY",
    "شهري": "PAID_MONTHLY",
    "monthly": "PAID_MONTHLY",
    "سنوي": "PAID_ANNUAL",
    "annual": "PAID_ANNUAL",
    "yearly": "PAID_ANNUAL",

    // Legacy names (backward compatibility)
    "الخيار المرن": "PAID_MONTHLY",
    "الخيار الأذكى": "PAID_ANNUAL",
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
