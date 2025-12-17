// src/lib/salla/scopes.ts
/**
 * إدارة مرنة لصلاحيات سلة حسب متطلبات التاجر
 * متطلبات سلة: "متطلباتنا تقتصر في اختيارات الwebhooks والscopes التي تلبي احتياجاتكم فقط"
 */

export type SallaScope = 
  | 'offline_access'        // مطلوب للـ refresh token
  | 'settings.read'         // قراءة إعدادات المتجر
  | 'customers.read'        // قراءة بيانات العملاء
  | 'orders.read'           // قراءة الطلبات (مطلوب لإرسال التقييمات)
  | 'products.read'         // قراءة المنتجات (اختياري)
  | 'webhooks.read_write'   // إدارة الwebhooks (مطلوب للإشعارات)
  | 'notifications.read'    // قراءة الإشعارات (اختياري)
  | 'analytics.read'        // قراءة التحليلات (اختياري)
  | 'reviews.read';         // قراءة المراجعات من Salla

/**
 * الصلاحيات الأساسية المطلوبة لعمل التطبيق
 */
export const CORE_SCOPES: SallaScope[] = [
  'offline_access',
  'settings.read', 
  'customers.read',
  'orders.read',
  'webhooks.read_write',
  'reviews.read'          // ✨ جديد: لقراءة المراجعات من Salla
];

/**
 * الصلاحيات الإضافية المفيدة
 */
export const OPTIONAL_SCOPES: SallaScope[] = [
  'products.read',
  'notifications.read',
  'analytics.read'
];

/**
 * تكوين الصلاحيات بناءً على متطلبات التاجر
 */
export function buildSallaScopes(options?: {
  includeProducts?: boolean;
  includeNotifications?: boolean; 
  includeAnalytics?: boolean;
  customScopes?: string[];
}): string {
  const scopes = new Set<string>(CORE_SCOPES);
  
  // إضافة الصلاحيات الاختيارية حسب التكوين
  if (options?.includeProducts) {
    scopes.add('products.read');
  }
  
  if (options?.includeNotifications) {
    scopes.add('notifications.read');
  }
  
  if (options?.includeAnalytics) {
    scopes.add('analytics.read');
  }
  
  // إضافة صلاحيات مخصصة
  if (options?.customScopes) {
    options.customScopes.forEach(scope => scopes.add(scope));
  }
  
  return Array.from(scopes).join(' ');
}

/**
 * الحصول على الصلاحيات الافتراضية المحدّدة في متغيرات البيئة
 */
export function getDefaultSallaScopes(): string {
  // تحقق من متغيرات البيئة لتخصيص الصلاحيات
  const includeProducts = process.env.SALLA_INCLUDE_PRODUCTS === 'true';
  const includeNotifications = process.env.SALLA_INCLUDE_NOTIFICATIONS === 'true';
  const includeAnalytics = process.env.SALLA_INCLUDE_ANALYTICS === 'true';
  
  // صلاحيات مخصصة من متغيرات البيئة
  const customScopes = process.env.SALLA_CUSTOM_SCOPES?.split(',').map(s => s.trim()).filter(Boolean);
  
  return buildSallaScopes({
    includeProducts,
    includeNotifications,
    includeAnalytics,
    customScopes
  });
}

/**
 * الحصول على قائمة الWebhooks المطلوبة
 */
export function getRequiredWebhooks(): string[] {
  const webhooks = [
    'app.store.authorize',    // مطلوب للـ Easy OAuth
    'app.installed',          // تثبيت التطبيق
    'app.uninstalled',        // إزالة التطبيق
    'order.created',          // طلب جديد (لإرسال التقييمات)
    'order.updated',          // تحديث الطلب
    'order.shipped',          // شحن الطلب
  ];
  
  // إضافة webhooks إضافية من متغيرات البيئة
  const extraWebhooks = process.env.SALLA_EXTRA_WEBHOOKS?.split(',').map(s => s.trim()).filter(Boolean);
  if (extraWebhooks) {
    webhooks.push(...extraWebhooks);
  }
  
  return webhooks;
}

/**
 * وصف الصلاحيات للعرض للمستخدم
 */
export const SCOPE_DESCRIPTIONS: Record<SallaScope, string> = {
  'offline_access': 'الوصول المستمر لحسابك (مطلوب)',
  'settings.read': 'قراءة إعدادات المتجر (مطلوب)',
  'customers.read': 'قراءة بيانات العملاء لإرسال التقييمات (مطلوب)',
  'orders.read': 'قراءة الطلبات لمتابعة عملية التقييم (مطلوب)',
  'webhooks.read_write': 'إدارة الإشعارات والأحداث (مطلوب)',
  'products.read': 'قراءة بيانات المنتجات للتقييمات المتقدمة',
  'notifications.read': 'قراءة إشعارات المتجر',
  'analytics.read': 'الوصول لتحليلات المتجر',
  'reviews.read': 'قراءة تقييمات المنتجات من سلة (مطلوب للمزامنة)'
};