# Error Codes Reference

TheQah API uses standardized error codes with internationalization support (Arabic/English).

## Error Response Format

All API errors follow this structure:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "حقل مطلوب مفقود",
    "statusCode": 400,
    "timestamp": "2025-12-18T10:30:00.000Z",
    "requestId": "550e8400-e29b-41d4-a716-446655440000",
    "details": {
      "field": "email"
    }
  }
}
```

## HTTP Status Codes

| Status Code | Meaning |
|------------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Authentication required |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource doesn't exist |
| 409 | Conflict - Resource already exists |
| 429 | Too Many Requests - Rate limit exceeded |
| 500 | Internal Server Error |
| 503 | Service Unavailable |

## Error Codes

### Authentication Errors (401, 403)

#### UNAUTHORIZED
**HTTP Status:** 401  
**Arabic:** غير مصرح لك بالوصول. يرجى تسجيل الدخول.  
**English:** Unauthorized access. Please log in.  
**When:** No valid session or token provided

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "غير مصرح لك بالوصول. يرجى تسجيل الدخول.",
    "statusCode": 401
  }
}
```

#### FORBIDDEN
**HTTP Status:** 403  
**Arabic:** ليس لديك صلاحية للقيام بهذا الإجراء.  
**English:** You do not have permission to perform this action.  
**When:** Valid auth but insufficient permissions

#### INVALID_TOKEN
**HTTP Status:** 401  
**Arabic:** رمز المصادقة غير صالح.  
**English:** Invalid authentication token.  
**When:** Token is malformed or corrupted

#### TOKEN_EXPIRED
**HTTP Status:** 401  
**Arabic:** انتهت صلاحية جلسة المصادقة. يرجى تسجيل الدخول مرة أخرى.  
**English:** Authentication session expired. Please log in again.  
**When:** Token or session has expired

---

### Validation Errors (400)

#### VALIDATION_ERROR
**HTTP Status:** 400  
**Arabic:** بيانات غير صحيحة. يرجى التحقق من المدخلات.  
**English:** Invalid data. Please check your inputs.  
**When:** General validation failure

#### MISSING_REQUIRED_FIELD
**HTTP Status:** 400  
**Arabic:** الحقل "{field}" مطلوب.  
**English:** Field "{field}" is required.  
**When:** Required field is missing  
**Parameters:** `{field}` - Field name

```json
{
  "error": {
    "code": "MISSING_REQUIRED_FIELD",
    "message": "الحقل \"email\" مطلوب.",
    "statusCode": 400,
    "details": { "field": "email" }
  }
}
```

#### INVALID_FORMAT
**HTTP Status:** 400  
**Arabic:** تنسيق "{field}" غير صحيح.  
**English:** Invalid format for "{field}".  
**When:** Field format is incorrect (e.g., invalid email)  
**Parameters:** `{field}` - Field name

#### INVALID_INPUT
**HTTP Status:** 400  
**Arabic:** قيمة "{field}" غير صالحة.  
**English:** Invalid value for "{field}".  
**When:** Field value is not acceptable  
**Parameters:** `{field}` - Field name

---

### Resource Errors (404, 409)

#### NOT_FOUND
**HTTP Status:** 404  
**Arabic:** {resource} غير موجود.  
**English:** {resource} not found.  
**When:** Resource doesn't exist  
**Parameters:** `{resource}` - Resource name (e.g., "المتجر", "المراجعة")

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "المتجر غير موجود.",
    "statusCode": 404,
    "details": { "resource": "Store", "id": "store123" }
  }
}
```

#### ALREADY_EXISTS
**HTTP Status:** 409  
**Arabic:** {resource} موجود بالفعل.  
**English:** {resource} already exists.  
**When:** Trying to create existing resource  
**Parameters:** `{resource}` - Resource name

#### DUPLICATE
**HTTP Status:** 409  
**Arabic:** {resource} مكرر. يرجى استخدام قيمة مختلفة.  
**English:** Duplicate {resource}. Please use a different value.  
**When:** Unique constraint violation  
**Parameters:** `{resource}` - Resource name

---

### Operation Errors (500, 503)

#### OPERATION_FAILED
**HTTP Status:** 500  
**Arabic:** فشلت العملية. يرجى المحاولة مرة أخرى.  
**English:** Operation failed. Please try again.  
**When:** Generic operation failure

#### TRANSACTION_FAILED
**HTTP Status:** 500  
**Arabic:** فشلت المعاملة. يرجى المحاولة مرة أخرى.  
**English:** Transaction failed. Please try again.  
**When:** Database transaction failure (after retries)

#### EXTERNAL_API_ERROR
**HTTP Status:** 502  
**Arabic:** خطأ في الاتصال بـ {service}. يرجى المحاولة لاحقاً.  
**English:** Error connecting to {service}. Please try again later.  
**When:** External API (Salla, SMS, Email) fails  
**Parameters:** `{service}` - Service name

```json
{
  "error": {
    "code": "EXTERNAL_API_ERROR",
    "message": "خطأ في الاتصال بـ سلة. يرجى المحاولة لاحقاً.",
    "statusCode": 502,
    "details": { "service": "Salla", "error": "Connection timeout" }
  }
}
```

---

### Business Logic Errors (429, 402, 403)

#### QUOTA_EXCEEDED
**HTTP Status:** 429  
**Arabic:** تم الوصول للحد الشهري ({used}/{limit} مراجعة). {details}  
**English:** Monthly quota exceeded ({used}/{limit} reviews). {details}  
**When:** Subscription quota limit reached  
**Parameters:** `{used}`, `{limit}`, `{details}`

```json
{
  "error": {
    "code": "QUOTA_EXCEEDED",
    "message": "تم الوصول للحد الشهري (1000/1000 مراجعة). يرجى الترقية للباقة السنوية.",
    "statusCode": 429,
    "details": {
      "used": 1000,
      "limit": 1000,
      "resetDate": "2025-02-01T00:00:00Z"
    }
  }
}
```

#### RATE_LIMIT_EXCEEDED
**HTTP Status:** 429  
**Arabic:** تجاوزت الحد المسموح من الطلبات. حاول مرة أخرى بعد {retry} دقيقة.  
**English:** Rate limit exceeded. Try again in {retry} minutes.  
**When:** Too many requests in time window  
**Parameters:** `{retry}` - Minutes until reset

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "تجاوزت الحد المسموح من الطلبات. حاول مرة أخرى بعد 5 دقيقة.",
    "statusCode": 429,
    "details": { "retryAfter": 300 }
  }
}
```

#### INSUFFICIENT_PERMISSIONS
**HTTP Status:** 403  
**Arabic:** ليس لديك صلاحية كافية للقيام بهذا الإجراء.  
**English:** Insufficient permissions for this action.  
**When:** User role doesn't allow action

#### SUBSCRIPTION_INACTIVE
**HTTP Status:** 402  
**Arabic:** اشتراكك غير نشط. يرجى تجديد الاشتراك.  
**English:** Your subscription is inactive. Please renew.  
**When:** Subscription expired or cancelled

#### SUBSCRIPTION_REQUIRED
**HTTP Status:** 402  
**Arabic:** هذه الميزة تتطلب اشتراك مدفوع.  
**English:** This feature requires a paid subscription.  
**When:** Feature requires paid plan

---

### System Errors (500, 503, 504)

#### INTERNAL_ERROR
**HTTP Status:** 500  
**Arabic:** حدث خطأ داخلي. يرجى المحاولة لاحقاً.  
**English:** Internal server error. Please try again later.  
**When:** Unexpected server error

#### SERVICE_UNAVAILABLE
**HTTP Status:** 503  
**Arabic:** الخدمة غير متاحة حالياً. يرجى المحاولة لاحقاً.  
**English:** Service unavailable. Please try again later.  
**When:** Service is down for maintenance

#### TIMEOUT
**HTTP Status:** 504  
**Arabic:** انتهت مهلة الطلب. يرجى المحاولة مرة أخرى.  
**English:** Request timeout. Please try again.  
**When:** Operation took too long

#### DATABASE_ERROR
**HTTP Status:** 500  
**Arabic:** خطأ في قاعدة البيانات. يرجى المحاولة لاحقاً.  
**English:** Database error. Please try again later.  
**When:** Firestore operation fails

---

## Resource Name Translations

These are used in `{resource}` parameters:

| English | Arabic |
|---------|--------|
| Store | المتجر |
| Review | المراجعة |
| User | المستخدم |
| Token | الرمز |
| Subscription | الاشتراك |
| Product | المنتج |
| Order | الطلب |
| Domain | النطاق |
| Widget | الويدجت |
| Settings | الإعدادات |
| File | الملف |
| Data | البيانات |

## Localization

### Request Headers

Specify preferred language:

```http
Accept-Language: ar
Accept-Language: en
```

Default: `ar` (Arabic)

### Implementation

```typescript
import { getErrorMessage, translateResource } from '@/locales/errors';

// Get localized error message
const message = getErrorMessage('NOT_FOUND', 'ar', { 
  resource: translateResource('Store', 'ar') 
});
// Result: "المتجر غير موجود."

// Auto-detect locale from headers
const locale = getLocaleFromHeaders(req.headers);
const error = Errors.notFound('Store').withLocale(locale);
```

## Best Practices

1. **Always include request ID** for debugging
2. **Use appropriate HTTP status codes**
3. **Provide detailed context** in `details` field
4. **Respect user locale** from Accept-Language header
5. **Don't expose sensitive information** in error messages
6. **Log full errors server-side** while sanitizing client responses

## See Also

- [Error Handler Implementation](../../src/server/errors/error-handler.ts)
- [i18n Error Messages](../../src/locales/errors.ts)
- [API Usage Examples](../../src/examples/api-with-i18n.example.ts)
