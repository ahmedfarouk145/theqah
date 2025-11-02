# تحديثات نظام الاشتراكات

## ملخص التغييرات

تم تحديث نظام تتبع الاشتراكات لدعم الباقات الجديدة من Salla مع عداد شهري للميزات المستخدمة.

---

## الباقات الجديدة

### 1. باقة الانطلاقة (Starter Plan)
- **السعر:** 19 ريال/شهريًا (27 ريال قبل الخصم 30٪)
- **عدد الدعوات:** 120 دعوة تقييم موثوقة شهريًا
- **Plan ID:** `STARTER`

### 2. باقة زيادة المبيعات (Sales Boost Plan) ⭐
- **السعر:** 29 ريال/شهريًا (41 ريال قبل الخصم 30٪)
- **عدد الدعوات:** 250 دعوة تقييم موثوقة شهريًا
- **Plan ID:** `SALES_BOOST`
- **ملاحظة:** الباقة الأكثر رواجًا

### 3. باقة التوسع (Expansion Plan)
- **السعر:** 49 ريال/شهريًا (69 ريال قبل الخصم 30٪)
- **عدد الدعوات:** 600 دعوة تقييم موثوقة شهريًا
- **Plan ID:** `EXPANSION`

---

## كيفية العمل

### 1. استقبال Webhook من Salla

عندما يشترك متجر في باقة، يرسل Salla webhook event:

```
Event: app.subscription.activated | app.subscription.updated
ملاحظة: app.trial.* events قد تأتي من Salla لكن النظام يعالجها كأحداث subscription عادية
```

**Payload Structure:**
```json
{
  "event": "app.subscription.activated",
  "merchant": "123456789",
  "created_at": "2025-01-01T10:00:00Z",
  "data": {
    "plan_name": "Starter Plan",  // أو "زيادة المبيعات" أو "التوسع"
    "plan_type": "starter",        // اختياري
    // ... باقي البيانات
  }
}
```

### 2. معالجة Webhook

الكود في `src/pages/api/salla/webhook.ts` يقوم بـ:

1. **استخراج اسم الباقة** من payload
   - يبحث في: `plan_name`, `name`, `plan.name`
   
2. **تحويل اسم الباقة** إلى Plan ID
   - يستخدم `mapSallaPlanToInternal()` من `src/config/plans.ts`
   - يدعم الأسماء بالعربية والإنجليزية

3. **تحديث Firestore**
   - يحدث `stores/{storeUid}` document
   - يحفظ `subscription.planId` و `subscription.raw`
   - يحدث `plan.code` و `plan.active` (للتوافق مع النظام القديم)

### 3. تخزين البيانات

```typescript
// stores/{storeUid}
{
  subscription: {
    planId: "STARTER" | "SALES_BOOST" | "EXPANSION" | "TRIAL" | "ELITE",
    raw: { ... },          // Full Salla payload
    syncedAt: 1234567890,  // Timestamp
    updatedAt: 1234567890
  },
  plan: {
    code: "STARTER",
    active: true,
    updatedAt: 1234567890
  },
  usage: {
    monthKey: "2025-01",   // YYYY-MM format
    invitesUsed: 15,       // Current month count
    updatedAt: 1234567890
  }
}
```

### 4. عداد الاستخدام الشهري

**عند إرسال دعوة:**
- يتم استدعاء `onInviteSent(storeUid)` بعد نجاح الإرسال
- يتم زيادة `usage.invitesUsed` بمقدار 1
- يتم إعادة تعيين العداد تلقائيًا في أول يوم من كل شهر

**قبل إرسال دعوة:**
- يتم استدعاء `canSendInvite(storeUid)`
- يتحقق من:
  - وجود الباقة ونشاطها
  - عدم تجاوز الحد الشهري (`invitesUsed < limit`)
  - باقة ELITE: غير محدودة (null = unlimited)

---

## الملفات المحدثة

### 1. `src/config/plans.ts`
- ✅ تحديث تعريفات الباقات الجديدة
- ✅ تحديث `mapSallaPlanToInternal()` لدعم الأسماء بالعربية والإنجليزية
- ✅ إضافة دعم للأسماء القديمة (للتوافق)

### 2. `src/pages/api/salla/webhook.ts`
- ✅ تحديث معالج subscription events
- ✅ استخدام `mapSallaPlanToInternal()` بدلاً من الخريطة القديمة
- ✅ تحديث `plan` و `subscription` fields في Firestore

### 3. `src/server/billing/plans.ts`
- ✅ تحديث `PlanCode` type
- ✅ تحديث `getPlanConfig()` للباقات الجديدة
- ✅ إضافة دعم لـ ELITE (null = unlimited)

### 4. `src/server/billing/usage.ts`
- ✅ تحديث `canSendInvite()` لدعم unlimited plans
- ✅ التحقق من `null` limit للباقات غير المحدودة

### 5. `src/pages/api/admin/subscriptions/index.ts`
- ✅ تحديث `PLAN_LIMITS` للباقات الجديدة
- ✅ تحديث `deriveStatus()` لدعم unlimited plans
- ✅ إضافة دعم للباقات القديمة (للتوافق)

### 6. `src/components/admin/AdminSubscriptions.tsx`
- ✅ تحديث واجهة الإدارة للباقات الجديدة
- ✅ تحديث قائمة الفلترة
- ✅ تحديث عرض الحدود

---

## خريطة التعيين (Salla → Internal)

| Salla Plan Name (Arabic) | Salla Plan Name (English) | Internal Plan ID |
|-------------------------|---------------------------|------------------|
| انطلاقة / الانطلاقة / باقة الانطلاقة | starter / starter plan | `STARTER` |
| زيادة المبيعات / زيادة مبيعات / باقة زيادة المبيعات | sales boost / sales boost plan | `SALES_BOOST` |
| توسع / التوسع / باقة التوسع | expansion / expansion plan | `EXPANSION` |
| تجربة / trial | trial | `TRIAL` |
| نخبة / elite | elite | `ELITE` |

**ملاحظة:** يدعم البحث الجزئي (partial matching) في حالة وجود كلمات إضافية في اسم الباقة.

---

## استخدام الكود

### التحقق من إمكانية إرسال دعوة

```typescript
import { canSendInvite } from "@/server/billing/usage";

const check = await canSendInvite("salla:123456789");

if (!check.ok) {
  if (check.reason === "quota_exhausted") {
    console.log(`تم تجاوز الحد: ${check.used}/${check.limit}`);
  }
  return;
}

// المتابعة مع إرسال الدعوة
await sendInvite(...);
await onInviteSent("salla:123456789");
```

### زيادة العداد بعد إرسال دعوة

```typescript
import { onInviteSent } from "@/server/subscription/usage";

// بعد نجاح إرسال دعوة
await onInviteSent("salla:123456789");
```

### الحصول على معلومات الباقة

```typescript
import { PLANS } from "@/config/plans";

const plan = PLANS["STARTER"];
console.log(plan.name);        // "باقة الانطلاقة"
console.log(plan.priceSar);   // 19
console.log(plan.invitesPerMonth); // 120
```

---

## الاختبار

### 1. اختبار Webhook

يمكن استخدام `tools/test-salla-webhook.js` لاختبار subscription events:

```bash
node tools/test-salla-webhook.js
```

### 2. اختبار التعيين

```typescript
import { mapSallaPlanToInternal } from "@/config/plans";

// يجب أن ترجع "STARTER"
mapSallaPlanToInternal("Starter Plan", null);
mapSallaPlanToInternal("انطلاقة", null);
mapSallaPlanToInternal("start", null);
```

### 3. اختبار الاشتراك

1. قم بإرسال webhook event من Salla
2. تحقق من تحديث `stores/{storeUid}` في Firestore
3. تحقق من `subscription.planId` و `plan.code`
4. اختبر إرسال دعوة وتحقق من زيادة العداد

---

## التوافق مع النظام القديم

تم الحفاظ على التوافق مع الباقات القديمة:

- `P30` → `STARTER` (120 دعوة)
- `P60` → `SALES_BOOST` (250 دعوة)
- `P120` → `EXPANSION` (600 دعوة)

الأنظمة القديمة التي تستخدم `P30`, `P60`, `P120` ستستمر في العمل ولكن سيتم معاملتها كالباقات الجديدة.

---

## ملاحظات مهمة

1. **العداد الشهري:** يتم إعادة تعيين العداد تلقائيًا في أول يوم من كل شهر (UTC-based)

2. **باقة ELITE:** غير محدودة (`null` = unlimited)، لا يتم فحص الحد

3. **Salla Plan Names:** قد تختلف أسماء الباقات في Salla، يجب التحقق من الأسماء الفعلية المرسلة في webhook payload

4. **التوافق:** تم الحفاظ على التوافق مع النظام القديم لضمان عدم كسر الأنظمة الموجودة

---

## الخطوات التالية

1. ✅ تحديث تعريفات الباقات
2. ✅ تحديث webhook handler
3. ✅ تحديث حدود الباقات
4. ✅ تحديث واجهة الإدارة
5. ⏳ اختبار مع Salla webhooks الحقيقية
6. ⏳ التحقق من أسماء الباقات الفعلية من Salla
7. ⏳ مراقبة الاستخدام في الإنتاج

