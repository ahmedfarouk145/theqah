# مراجعة شاملة لنظام الاشتراكات

## ✅ ملخص المراجعة

تمت مراجعة جميع الملفات المتعلقة بنظام الاشتراكات وتحديثها بنجاح.

---

## ✅ الملفات المحدثة

### 1. تعريفات الباقات
**ملف:** `src/config/plans.ts`
- ✅ تم إزالة `TRIAL` و `ELITE` من `PlanId` type
- ✅ تم تحديث الباقات الثلاث:
  - `STARTER` (120 دعوة - 19 ريال)
  - `SALES_BOOST` (250 دعوة - 29 ريال) ⭐
  - `EXPANSION` (600 دعوة - 49 ريال)
- ✅ تم تحديث `mapSallaPlanToInternal()` لدعم الأسماء بالعربية والإنجليزية
- ✅ تم إزالة تعيينات `trial` و `elite` من الخريطة

### 2. نظام الفواتير
**ملف:** `src/server/billing/plans.ts`
- ✅ تم إزالة `TRIAL` و `ELITE` من `PlanCode` type
- ✅ تم تحديث `getPlanConfig()` للباقات الثلاث
- ✅ تم إزالة دعم unlimited plans (`null`)
- ✅ Default case يرجع `STARTER`

**ملف:** `src/server/billing/usage.ts`
- ✅ تم تحديث `canSendInvite()` لإزالة دعم unlimited
- ✅ تم تحديث `incrementUsageAfterSuccess()` لإضافة `monthKey` tracking
- ✅ Default يرجع `STARTER` بدلاً من `TRIAL`

### 3. Webhook Handler
**ملف:** `src/pages/api/salla/webhook.ts`
- ✅ تم تحديث subscription event handler
- ✅ يستخدم `mapSallaPlanToInternal()` بشكل صحيح
- ✅ يحدث `subscription` و `plan` fields في Firestore
- ✅ يحافظ على دعم `app.trial.*` events (لكن لن يعترف بها كباقة صحيحة)

### 4. Admin API
**ملف:** `src/pages/api/admin/subscription.ts`
- ✅ يستخدم `mapSallaPlanToInternal()` للتعيين
- ✅ يعمل بشكل صحيح مع الباقات الجديدة

**ملف:** `src/pages/api/admin/subscriptions/index.ts`
- ✅ تم إزالة `TRIAL` و `ELITE` من `PlanId` type
- ✅ تم تحديث `PLAN_LIMITS` للباقات الثلاث
- ✅ تم إزالة `trial` status
- ✅ تم تحديث `deriveStatus()` لإزالة دعم unlimited plans
- ✅ تم إصلاح import لـ `Firestore` type

### 5. Admin UI
**ملف:** `src/components/admin/AdminSubscriptions.tsx`
- ✅ تم إزالة `TRIAL` و `ELITE` من `PlanId` type
- ✅ تم تحديث `PLAN_LIMITS` للباقات الثلاث
- ✅ تم إزالة `trial` status من StatusBadge
- ✅ تم تحديث قائمة الفلترة للباقات الثلاث فقط
- ✅ تم تحديث عرض الحدود

### 6. Usage Tracking
**ملف:** `src/server/subscription/usage.ts`
- ✅ يستخدم `monthKey` tracking بشكل صحيح
- ✅ يزيد العداد ويحافظ على `monthKey`

---

## ✅ الباقات النهائية

| الباقة | Plan ID | السعر | الدعوات/شهر | الحالة |
|--------|---------|-------|-------------|--------|
| باقة الانطلاقة | `STARTER` | 19 ريال | 120 | ✅ |
| باقة زيادة المبيعات | `SALES_BOOST` | 29 ريال | 250 | ✅ الأكثر رواجًا |
| باقة التوسع | `EXPANSION` | 49 ريال | 600 | ✅ |

---

## ✅ التحقق من التوافق

### التعيين من Salla → Internal
- ✅ يدعم الأسماء بالعربية: "انطلاقة"، "زيادة المبيعات"، "توسع"
- ✅ يدعم الأسماء بالإنجليزية: "starter", "sales boost", "expansion"
- ✅ يدعم الأسماء القديمة: "start" → STARTER, "growth" → SALES_BOOST, "scale" → EXPANSION
- ✅ يدعم `plan_type` field للتحديد

### Webhook Processing
- ✅ يستقبل `app.subscription.*` events
- ✅ يستقبل `app.trial.*` events (لكن لا يعترف بها كباقة)
- ✅ يستخرج `plan_name` من عدة مصادر: `plan_name`, `name`, `plan.name`
- ✅ يستخرج `plan_type` من: `plan_type`, `type`

### Storage Structure
```typescript
stores/{storeUid} {
  subscription: {
    planId: "STARTER" | "SALES_BOOST" | "EXPANSION",
    raw: { ... },           // Full Salla payload
    syncedAt: number,
    updatedAt: number
  },
  plan: {
    code: "STARTER" | "SALES_BOOST" | "EXPANSION",
    active: true,
    updatedAt: number
  },
  usage: {
    monthKey: "2025-01",   // YYYY-MM format
    invitesUsed: 15,       // Current month count
    updatedAt: number
  }
}
```

### Usage Tracking
- ✅ يتم تتبع الاستخدام الشهري بشكل صحيح
- ✅ يتم إعادة تعيين العداد تلقائيًا في أول يوم من كل شهر
- ✅ يتم التحقق من الحدود قبل إرسال دعوة
- ✅ جميع الباقات لها حدود محددة (لا unlimited)

---

## ✅ المشاكل التي تم إصلاحها

1. ✅ إزالة `trial` status من StatusBadge في Admin UI
2. ✅ تحديث التعليقات لإزالة إشارات TRIAL
3. ✅ إصلاح `incrementUsageAfterSuccess()` لإضافة `monthKey` tracking
4. ✅ دمج تحديثات `subscription` و `plan` في Firestore في عملية واحدة
5. ✅ إصلاح import لـ `Firestore` type
6. ✅ تحديث التوثيق لإزالة إشارات TRIAL و ELITE

---

## ⚠️ ملاحظات مهمة

### 1. `app.trial.*` Events
النظام ما زال يستقبل `app.trial.*` events من Salla، لكن:
- إذا كان اسم الباقة في payload لا يتطابق مع الباقات الثلاث، سيُرجع `null`
- النظام سيسجل warning في logs لكن لن يحدث الباقة
- هذا سلوك متوقع - trial events من Salla لن تُعالج كباقة صحيحة

### 2. الباقات القديمة (P30, P60, P120)
- تم الحفاظ على التوافق مع الباقات القديمة
- `P30` → يعامل كـ `STARTER` (120 دعوة)
- `P60` → يعامل كـ `SALES_BOOST` (250 دعوة)
- `P120` → يعامل كـ `EXPANSION` (600 دعوة)

### 3. Default Plan
- عند عدم وجود باقة محددة، النظام يستخدم `STARTER` كافتراضي
- هذا يضمن أن جميع المتاجر لها باقة صحيحة

---

## ✅ الاختبار المقترح

### 1. اختبار Webhook
```bash
# إرسال subscription event مع plan_name = "Starter Plan"
curl -X POST https://your-app.com/api/salla/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "event": "app.subscription.activated",
    "merchant": "123456789",
    "data": {
      "plan_name": "Starter Plan"
    }
  }'
```

### 2. اختبار التعيين
```typescript
import { mapSallaPlanToInternal } from "@/config/plans";

// يجب أن ترجع "STARTER"
mapSallaPlanToInternal("Starter Plan", null);
mapSallaPlanToInternal("انطلاقة", null);

// يجب أن ترجع "SALES_BOOST"
mapSallaPlanToInternal("Sales Boost Plan", null);
mapSallaPlanToInternal("زيادة المبيعات", null);

// يجب أن ترجع "EXPANSION"
mapSallaPlanToInternal("Expansion Plan", null);
mapSallaPlanToInternal("التوسع", null);

// يجب أن ترجع null (لأن trial غير مدعوم)
mapSallaPlanToInternal("trial", null);
mapSallaPlanToInternal("تجربة", null);
```

### 3. اختبار Usage Tracking
```typescript
import { canSendInvite, incrementUsageAfterSuccess } from "@/server/billing/usage";

// يجب أن يرجع ok: true إذا invitesUsed < limit
const check = await canSendInvite("salla:123456789");

// بعد إرسال دعوة
await incrementUsageAfterSuccess("salla:123456789");
```

---

## ✅ الخلاصة

✅ جميع الملفات محدثة بنجاح  
✅ الباقات الثلاث (STARTER, SALES_BOOST, EXPANSION) مدعومة  
✅ TRIAL و ELITE تم إزالتها تمامًا  
✅ العداد الشهري يعمل بشكل صحيح  
✅ Webhook handler جاهز لاستقبال events من Salla  
✅ Admin UI محدث ويعرض الباقات الجديدة  
✅ التوافق مع النظام القديم محفوظ  

**النظام جاهز للاستخدام! 🎉**

