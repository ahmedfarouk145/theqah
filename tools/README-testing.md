# Testing Tools للنظام

## 1. اختبار Salla Webhooks

```bash
# اختبار كامل للويبهوك
TARGET=https://theqah.vercel.app/api/salla/webhook \
SALLA_WEBHOOK_SECRET=your-secret \
MERCHANT_ID=559541722 \
npm run test:webhook

# اختبار محدد
RUN=order npm run test:webhook
```

## 2. اختبار Review Sending (SMS/Email)

### استخدام أساسي:
```bash
# اختبار إرسال لإيميل وموبايل
STORE_UID=salla:559541722 \
CUSTOMER_EMAIL=test@example.com \
CUSTOMER_PHONE=+966555555555 \
CUSTOMER_NAME="أحمد محمد" \
STORE_NAME="متجر التجربة" \
npm run test:review
```

### خيارات متقدمة:
```bash
# اختبار الإيميل فقط
TEST_MODE=email \
CUSTOMER_EMAIL=your@email.com \
STORE_UID=salla:123 \
npm run test:review

# اختبار SMS فقط  
TEST_MODE=sms \
CUSTOMER_PHONE=+966501234567 \
STORE_UID=salla:123 \
npm run test:review

# مع إعدادات مخصصة
STORE_UID=salla:559541722 \
CUSTOMER_EMAIL=test@example.com \
CUSTOMER_PHONE=+966555555555 \
ORDER_ID=12345 \
PRODUCT_ID=P999 \
APP_BASE_URL=https://theqah.vercel.app \
TIMEOUT_MS=10000 \
npm run test:review
```

## 3. متغيرات البيئة المطلوبة

### للويبهوك:
- `TARGET` - عنوان الويبهوك
- `SALLA_WEBHOOK_SECRET` - مفتاح التوقيع
- `MERCHANT_ID` - معرف التاجر

### للمراجعات:
- `STORE_UID` - معرف المتجر (salla:123456)
- `CUSTOMER_EMAIL` - إيميل العميل (اختياري)
- `CUSTOMER_PHONE` - موبايل العميل (اختياري)
- `CUSTOMER_NAME` - اسم العميل
- `STORE_NAME` - اسم المتجر

**ملاحظة**: لازم إيميل أو موبايل على الأقل واحد منهم.

## 4. حل المشاكل

### خطأ في import sendBothNow:
- تأكد إنك في مجلد المشروع الأساسي
- شغّل `npm install`
- تأكد من وجود `/src/server/messaging/send-invite.js`

### خطأ في إعدادات SMS/Email:
- تأكد من متغيرات البيئة للخدمات (Twilio, Plivo, Nodemailer)
- تأكد من صحة أرقام الهواتف (+966...)
- تأكد من صحة عناوين الإيميل

### مشاكل الـ timeout:
- زود `TIMEOUT_MS` لأكبر من 15000
- تأكد من اتصال الإنترنت
