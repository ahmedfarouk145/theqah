# دليل إضافة OpenAI API Key في Vercel

## 🎯 الخطوات السريعة

### 1. اذهب إلى Vercel Dashboard
1. افتح: https://vercel.com/dashboard
2. اختر مشروع `theqah` (أو اسم المشروع الخاص بك)

### 2. إضافة Environment Variable
1. اذهب إلى **Settings** → **Environment Variables**
2. اضغط **Add New** أو **Create New**
3. املأ البيانات:
   - **Name:** `OPENAI_API_KEY`
   - **Value:** `sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` (مفتاحك من OpenAI)
   - **Environments:** اختر **Production**, **Preview**, و **Development** (كلها)
4. اضغط **Save**

### 3. (اختياري) إضافة Model Configuration
إذا أردت تغيير الـ model الافتراضي:
1. اضغط **Add New** مرة أخرى
2. املأ:
   - **Name:** `OPENAI_MODEL`
   - **Value:** `gpt-4o-mini` (أو `gpt-4o`, `gpt-4-turbo`)
   - **Environments:** Production, Preview, Development
3. اضغط **Save**

### 4. Redeploy
بعد إضافة المتغيرات:
1. اذهب إلى **Deployments**
2. اختر آخر deployment
3. اضغط **"..."** → **Redeploy**
4. ⚠️ **مهم:** تأكد من:
   - ✅ **Use existing Build Cache** = **Off** (لإعادة بناء مع المتغيرات الجديدة)
   - ✅ **Production** أو **Preview** حسب البيئة

### 5. التحقق
بعد إعادة النشر:
1. اذهب إلى **Deployments** → اختر آخر deployment
2. اضغط **View Function Logs** أو **Runtime Logs**
3. تحقق من عدم وجود أخطاء متعلقة بـ `OPENAI_API_KEY`

---

## 📸 Screenshots Guide (بالعربية)

### الخطوة 1: Settings
```
Vercel Dashboard
  └─> Your Project
      └─> Settings (في القائمة الجانبية)
```

### الخطوة 2: Environment Variables
```
Settings
  └─> Environment Variables (في القائمة)
      └─> Add New (زر في الأعلى)
```

### الخطوة 3: إضافة المتغير
```
Add Environment Variable
├─ Name: OPENAI_API_KEY
├─ Value: sk-proj-... (مفتاحك)
└─ Environments: ☑ Production ☑ Preview ☑ Development
```

---

## 🔍 التحقق من أن المفتاح يعمل

### من Vercel Logs
1. اذهب إلى **Deployments** → آخر deployment
2. اضغط **View Function Logs**
3. ابحث عن أي أخطاء:
   - ❌ `OPENAI_API_KEY is required`
   - ❌ `Invalid API key`
   - ✅ إذا لم يكن هناك أخطاء → المفتاح يعمل!

### من Application
1. افتح موقعك المباشر (production URL)
2. حاول إرسال تقييم جديد
3. تحقق من:
   - ✅ التقييم يُفحص بواسطة AI
   - ✅ النتائج تُحفظ في قاعدة البيانات

---

## 🐛 حل المشاكل

### مشكلة: "OPENAI_API_KEY is required"
**الحل:**
1. تحقق من أن المتغير أُضيف بشكل صحيح في Vercel
2. تأكد من اختيار **Production** و **Preview** في Environments
3. قم بـ **Redeploy** مع **Build Cache = Off**

### مشكلة: "Invalid API key"
**الحل:**
1. تحقق من أن المفتاح يبدأ بـ `sk-`
2. تأكد من عدم وجود مسافات قبل/بعد المفتاح
3. أنشئ مفتاح جديد من: https://platform.openai.com/api-keys
4. حدّث المتغير في Vercel و **Redeploy**

### مشكلة: "Insufficient quota"
**الحل:**
1. اذهب إلى: https://platform.openai.com/account/billing
2. تحقق من الرصيد
3. أضف رصيد جديد إذا لزم الأمر

---

## 📊 Structure في Database

بعد إضافة المفتاح، عندما يُرسل تقييم جديد، سيتم حفظه في Firestore كالتالي:

```typescript
// Collection: reviews/{reviewId}
{
  // بيانات التقييم الأساسية
  id: "review-123",
  orderId: "order-456",
  stars: 5,
  text: "منتج رائع!",
  images: ["https://ucarecdn.com/..."],
  status: "pending", // أو "published" أو "rejected"
  published: false,
  createdAt: 1234567890,
  
  // نتائج AI Moderation (مهم!)
  moderation: {
    model: "gpt-4o-mini", // أو "omni-moderation-latest"
    score: 0.95, // درجة الثقة (0-1)
    flags: [] // أو ["bad_words", "spam"] إذا كان مرفوض
  },
  
  // بيانات إضافية
  storeUid: "store-789",
  tokenId: "token-abc",
  // ...
}
```

---

## ✅ Checklist

قبل الإنتاج، تأكد من:

- [ ] ✅ أضفت `OPENAI_API_KEY` في Vercel
- [ ] ✅ اخترت **Production**, **Preview**, **Development**
- [ ] ✅ قمت بـ **Redeploy** مع **Build Cache = Off**
- [ ] ✅ تحققت من Logs - لا توجد أخطاء
- [ ] ✅ اختبرت إرسال تقييم جديد
- [ ] ✅ تحققت من أن `moderation` object موجود في Database
- [ ] ✅ أضفت رصيد في حساب OpenAI

---

## 🔗 روابط مفيدة

- **OpenAI API Keys:** https://platform.openai.com/api-keys
- **Vercel Environment Variables:** https://vercel.com/docs/projects/environment-variables
- **Vercel Dashboard:** https://vercel.com/dashboard
- **OpenAI Usage:** https://platform.openai.com/usage
- **OpenAI Billing:** https://platform.openai.com/account/billing

---

## 🎉 الخلاصة

بعد إضافة `OPENAI_API_KEY` في Vercel وإعادة النشر:
- ✅ سيتم فحص التقييمات تلقائياً بواسطة AI
- ✅ النتائج ستُحفظ في `reviews/{id}.moderation`
- ✅ التقييمات المرفوضة لن تُنشر تلقائياً
- ✅ التقييمات المقبولة ستُحصل على `status: "published"`

**جاهز للاستخدام! 🚀**

