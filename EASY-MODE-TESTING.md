# 🧪 كيفية تجربة Easy Mode

## 🚀 **الطريقة الأولى: تجربة سريعة (مُوصى بها)**

### 1. تشغيل المشروع محلياً:
```bash
npm run dev
```

### 2. جرب التسجيل التلقائي:
```bash
npm run test:easy-mode
```

هيعمل:
- ✅ تسجيل متجر جديد
- ✅ جلب Access Token
- ✅ اختبار Get User API
- ✅ عرض النتائج مفصلة

---

## 🌐 **الطريقة الثانية: عبر المتصفح**

### 1. افتح المتصفح واذهب إلى:
```
http://localhost:3000/easy-register
```

### 2. املأ النموذج بالبيانات:
```
البريد الإلكتروني: test@example.com
اسم المتجر: متجر التجربة
رابط المتجر: https://demostore.salla.sa/dev-test
معرف التاجر: 559541722 (اختياري)
```

### 3. اضغط "سجل المتجر الآن"

### 4. ستحصل على:
- ✅ Access Token
- ✅ Store UID  
- ✅ رسالة نجاح

---

## 🔧 **الطريقة الثالثة: اختبار APIs مباشرة**

### تسجيل متجر جديد:
```bash
curl -X POST http://localhost:3000/api/stores/easy-register \
  -H "Content-Type: application/json" \
  -d '{
    "merchantEmail": "test@example.com",
    "storeName": "متجر التجربة", 
    "storeUrl": "https://demostore.salla.sa/dev-test123",
    "merchantId": "559541722"
  }'
```

### جلب معلومات المستخدم:
```bash
curl -X POST http://localhost:3000/api/stores/get-user \
  -H "Content-Type: application/json" \  
  -d '{
    "accessToken": "YOUR_ACCESS_TOKEN_HERE"
  }'
```

---

## 📋 **ما يحدث خلف الكواليس:**

### عند التسجيل:
1. ✅ التحقق من صحة البيانات
2. ✅ إنشاء Store UID (مثال: `salla:559541722` أو `easy:abc123`)  
3. ✅ إنشاء Access Token عشوائي
4. ✅ حفظ بيانات المتجر في Firestore
5. ✅ إعداد خطة تجريبية (30 يوم، 5 دعوات شهرياً)
6. ✅ إنشاء رابط إعداد كلمة المرور
7. ✅ (اختياري) إرسال إيميل إعداد كلمة المرور

### عند جلب بيانات المستخدم:
1. ✅ التحقق من صحة Access Token
2. ✅ جلب بيانات المتجر من Firestore
3. ✅ عرض معلومات الخطة والاستخدام
4. ✅ تحديث آخر وصول

---

## 🎯 **النتائج المتوقعة:**

### نجح التسجيل:
```json
{
  "success": true,
  "message": "تم تسجيل المتجر بنجاح!",
  "storeUid": "salla:559541722",
  "accessToken": "abc123def456...",
  "setupLink": "http://localhost:3000/setup-password?token=xyz789"
}
```

### بيانات المستخدم:
```json
{
  "success": true,
  "user": {
    "storeUid": "salla:559541722",
    "storeName": "متجر التجربة",
    "merchantEmail": "test@example.com",
    "plan": {
      "code": "TRIAL",
      "active": true,
      "trialEndsAt": 1727634000000
    },
    "usage": {
      "invitesUsed": 0,
      "monthlyLimit": 5
    },
    "status": "pending_setup"
  }
}
```

---

## ⚠️ **ملاحظات مهمة:**

1. **Environment Variables**: تأكد من وجود:
   ```
   FIREBASE_PROJECT_ID=your-project
   FIREBASE_CLIENT_EMAIL=...
   FIREBASE_PRIVATE_KEY=...
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

2. **قاعدة البيانات**: يجب أن تكون Firestore شغالة

3. **كل تسجيل جديد**: يحتاج بريد إلكتروني مختلف

4. **الإيميلات**: ممكن متوصلش في التطوير المحلي (طبيعي)

---

## 🔍 **استكشاف الأخطاء:**

### خطأ "البريد مسجل مسبقاً":
- جرب بريد إلكتروني مختلف
- أو امسح البيانات من Firestore

### خطأ Firebase:
- تحقق من Environment Variables
- تأكد من صحة مفاتيح Firebase

### خطأ 500:
- شوف لوجز الـ Console في Terminal
- تأكد من تشغيل `npm run dev`

---

## 🎉 **إذا كل شيء شغال:**

هتشوف في Firestore collections جديدة:
- `stores` - بيانات المتاجر
- `setup_tokens` - توكنات إعداد كلمة المرور  
- `registration_logs` - سجل عمليات التسجيل

**🎯 معناها الـ Easy Mode شغال 100%!** 🚀

