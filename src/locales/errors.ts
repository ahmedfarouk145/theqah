/**
 * Internationalization (i18n) for Error Messages
 * 
 * Supports Arabic (ar) and English (en) error messages
 * Used by error-handler.ts for consistent multilingual error responses
 */

export type Locale = 'ar' | 'en';

export type ErrorCode =
  // Authentication errors
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'INVALID_TOKEN'
  | 'TOKEN_EXPIRED'
  // Validation errors
  | 'VALIDATION_ERROR'
  | 'MISSING_REQUIRED_FIELD'
  | 'INVALID_FORMAT'
  | 'INVALID_INPUT'
  // Resource errors
  | 'NOT_FOUND'
  | 'ALREADY_EXISTS'
  | 'DUPLICATE'
  // Operation errors
  | 'OPERATION_FAILED'
  | 'TRANSACTION_FAILED'
  | 'EXTERNAL_API_ERROR'
  // Business logic errors
  | 'QUOTA_EXCEEDED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'INSUFFICIENT_PERMISSIONS'
  | 'SUBSCRIPTION_INACTIVE'
  | 'SUBSCRIPTION_REQUIRED'
  // System errors
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE'
  | 'TIMEOUT'
  | 'DATABASE_ERROR';

/**
 * Error message templates with placeholders
 * Use {param} syntax for dynamic values
 */
export const ERROR_MESSAGES: Record<ErrorCode, { ar: string; en: string }> = {
  // Authentication errors
  UNAUTHORIZED: {
    ar: 'غير مصرح لك بالوصول. يرجى تسجيل الدخول.',
    en: 'Unauthorized access. Please log in.',
  },
  FORBIDDEN: {
    ar: 'ليس لديك صلاحية للقيام بهذا الإجراء.',
    en: 'You do not have permission to perform this action.',
  },
  INVALID_TOKEN: {
    ar: 'رمز المصادقة غير صالح.',
    en: 'Invalid authentication token.',
  },
  TOKEN_EXPIRED: {
    ar: 'انتهت صلاحية جلسة المصادقة. يرجى تسجيل الدخول مرة أخرى.',
    en: 'Authentication session expired. Please log in again.',
  },

  // Validation errors
  VALIDATION_ERROR: {
    ar: 'بيانات غير صحيحة. يرجى التحقق من المدخلات.',
    en: 'Invalid data. Please check your inputs.',
  },
  MISSING_REQUIRED_FIELD: {
    ar: 'الحقل "{field}" مطلوب.',
    en: 'Field "{field}" is required.',
  },
  INVALID_FORMAT: {
    ar: 'تنسيق "{field}" غير صحيح.',
    en: 'Invalid format for "{field}".',
  },
  INVALID_INPUT: {
    ar: 'قيمة "{field}" غير صالحة.',
    en: 'Invalid value for "{field}".',
  },

  // Resource errors
  NOT_FOUND: {
    ar: '{resource} غير موجود.',
    en: '{resource} not found.',
  },
  ALREADY_EXISTS: {
    ar: '{resource} موجود بالفعل.',
    en: '{resource} already exists.',
  },
  DUPLICATE: {
    ar: '{resource} مكرر. يرجى استخدام قيمة مختلفة.',
    en: 'Duplicate {resource}. Please use a different value.',
  },

  // Operation errors
  OPERATION_FAILED: {
    ar: 'فشلت العملية. يرجى المحاولة مرة أخرى.',
    en: 'Operation failed. Please try again.',
  },
  TRANSACTION_FAILED: {
    ar: 'فشلت المعاملة. يرجى المحاولة مرة أخرى.',
    en: 'Transaction failed. Please try again.',
  },
  EXTERNAL_API_ERROR: {
    ar: 'خطأ في الاتصال بـ {service}. يرجى المحاولة لاحقاً.',
    en: 'Error connecting to {service}. Please try again later.',
  },

  // Business logic errors
  QUOTA_EXCEEDED: {
    ar: 'تم تجاوز الحد المسموح. {details}',
    en: 'Quota exceeded. {details}',
  },
  RATE_LIMIT_EXCEEDED: {
    ar: 'تم تجاوز الحد الأقصى للطلبات. يرجى المحاولة بعد {retry} دقيقة.',
    en: 'Rate limit exceeded. Please try again in {retry} minutes.',
  },
  INSUFFICIENT_PERMISSIONS: {
    ar: 'صلاحيات غير كافية لإجراء هذه العملية.',
    en: 'Insufficient permissions for this operation.',
  },
  SUBSCRIPTION_INACTIVE: {
    ar: 'الاشتراك غير نشط. يرجى تفعيل الاشتراك للمتابعة.',
    en: 'Subscription is inactive. Please activate your subscription to continue.',
  },
  SUBSCRIPTION_REQUIRED: {
    ar: 'الاشتراك مطلوب. يرجى الاشتراك في الباقة للمتابعة.',
    en: 'Subscription required. Please subscribe to continue.',
  },

  // System errors
  INTERNAL_ERROR: {
    ar: 'خطأ داخلي في الخادم. نعمل على حل المشكلة.',
    en: 'Internal server error. We are working on fixing this.',
  },
  SERVICE_UNAVAILABLE: {
    ar: 'الخدمة غير متاحة حالياً. يرجى المحاولة لاحقاً.',
    en: 'Service unavailable. Please try again later.',
  },
  TIMEOUT: {
    ar: 'انتهت مهلة الطلب. يرجى المحاولة مرة أخرى.',
    en: 'Request timeout. Please try again.',
  },
  DATABASE_ERROR: {
    ar: 'خطأ في قاعدة البيانات. يرجى المحاولة لاحقاً.',
    en: 'Database error. Please try again later.',
  },
};

/**
 * Resource name translations
 */
export const RESOURCE_NAMES: Record<string, { ar: string; en: string }> = {
  Store: { ar: 'المتجر', en: 'Store' },
  Review: { ar: 'المراجعة', en: 'Review' },
  User: { ar: 'المستخدم', en: 'User' },
  Token: { ar: 'الرمز', en: 'Token' },
  Subscription: { ar: 'الاشتراك', en: 'Subscription' },
  Product: { ar: 'المنتج', en: 'Product' },
  Order: { ar: 'الطلب', en: 'Order' },
  Domain: { ar: 'النطاق', en: 'Domain' },
  Widget: { ar: 'الويدجت', en: 'Widget' },
  Settings: { ar: 'الإعدادات', en: 'Settings' },
  File: { ar: 'الملف', en: 'File' },
  Data: { ar: 'البيانات', en: 'Data' },
};

/**
 * Get error message in specified locale
 * Supports parameter substitution using {param} syntax
 * 
 * @example
 * getErrorMessage('NOT_FOUND', 'ar', { resource: 'المتجر' })
 * // Returns: "المتجر غير موجود."
 */
export function getErrorMessage(
  code: ErrorCode,
  locale: Locale = 'ar',
  params?: Record<string, string | number>
): string {
  const messages = ERROR_MESSAGES[code];
  if (!messages) {
    return locale === 'ar' 
      ? 'حدث خطأ غير متوقع.'
      : 'An unexpected error occurred.';
  }

  let message = messages[locale];

  // Replace parameters
  if (params) {
    Object.keys(params).forEach((key) => {
      const value = params[key];
      message = message.replace(`{${key}}`, String(value));
    });
  }

  return message;
}

/**
 * Translate resource name to specified locale
 */
export function translateResource(
  resource: string,
  locale: Locale = 'ar'
): string {
  const translation = RESOURCE_NAMES[resource];
  return translation ? translation[locale] : resource;
}

/**
 * Get locale from request headers or default to Arabic
 */
export function getLocaleFromHeaders(headers: Record<string, string | string[] | undefined>): Locale {
  const acceptLanguage = headers['accept-language'];
  
  if (typeof acceptLanguage === 'string') {
    // Check for English preference
    if (acceptLanguage.toLowerCase().includes('en')) {
      return 'en';
    }
  }
  
  // Default to Arabic (Saudi market)
  return 'ar';
}

/**
 * Format error response with localized message
 */
export function formatErrorResponse(
  code: ErrorCode,
  locale: Locale = 'ar',
  params?: Record<string, string | number>,
  details?: unknown
) {
  return {
    error: {
      code,
      message: getErrorMessage(code, locale, params),
      ...(details ? { details } : {}),
    },
  };
}
