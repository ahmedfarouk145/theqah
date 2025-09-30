// src/server/messaging/unified-templates.ts
// Templates موحدة للـ SMS والـ Email مع اسم المنتج والمتجر

export interface ReviewInviteData {
  customerName: string;
  storeName: string;
  productName?: string; // اسم المنتج الأساسي
  reviewUrl: string;
  orderNumber?: string;
}

// ✅ SMS Template - نفس النص بالضبط
export function buildUnifiedSMS(data: ReviewInviteData): string {
  const name = data.customerName || "عميلنا العزيز";
  const store = data.storeName || "المتجر";
  const product = data.productName;
  
  // إذا في اسم منتج، أضيفه للرسالة
  const productPart = product ? ` (${product})` : "";
  
  return `مرحباً ${name}، قيّم تجربتك من ${store}${productPart}: ${data.reviewUrl} وساهم في إسعاد يتيم!`;
}

// ✅ Email HTML Template - UI حلو ومتقدم
export function buildUnifiedEmailHTML(data: ReviewInviteData): string {
  const name = data.customerName || "عميلنا العزيز";
  const store = data.storeName || "المتجر";
  const product = data.productName;
  const orderNum = data.orderNumber;
  
  // Product section في الإيميل
  const productSection = product ? `
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:16px 0;">
      <p style="margin:0;font-size:14px;color:#334155;">
        <strong style="color:#0f172a;">المنتج:</strong> ${product}
      </p>
      ${orderNum ? `<p style="margin:8px 0 0 0;font-size:12px;color:#64748b;">رقم الطلب: ${orderNum}</p>` : ''}
    </div>
  ` : '';

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>قيّم تجربتك من ${store}</title>
  <style>
    .review-button:hover { background-color: #15803d !important; }
    .product-box { transition: all 0.2s ease; }
    .product-box:hover { background-color: #f1f5f9; }
  </style>
</head>
<body style="margin:0;padding:0;background:#f6f7f9;font-family:'Segoe UI',Tahoma,Arial,sans-serif;">
  <div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0;">
    قيّم تجربتك من ${store} وساهم في إسعاد يتيم! ‏‏​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​
  </div>
  
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9;">
    <tr>
      <td align="center" style="padding:24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);overflow:hidden;">
          
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg, #16a34a 0%, #059669 100%);padding:24px;text-align:right;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="text-align:right;">
                    <img src="https://www.theqah.com.sa/logo.png" alt="ثقة" width="32" height="32" style="vertical-align:middle;border:none;margin-left:12px;border-radius:6px;">
                    <span style="font-size:20px;font-weight:bold;color:#ffffff;vertical-align:middle;">ثقة</span>
                  </td>
                  <td style="text-align:left;">
                    <span style="background:rgba(255,255,255,0.2);color:#ffffff;font-size:12px;padding:6px 12px;border-radius:20px;">
                      تقييم المنتج
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Main Content -->
          <tr>
            <td style="padding:32px 24px;text-align:right;">
              <h1 style="margin:0 0 16px 0;font-size:24px;color:#0f172a;font-weight:bold;">
                مرحباً ${name}! 👋
              </h1>
              <p style="margin:0 0 20px 0;font-size:16px;color:#334155;line-height:1.6;">
                نتطلع لمعرفة رأيك في تجربة التسوق من <strong style="color:#16a34a;">${store}</strong>
              </p>
              
              ${productSection}
              
              <div style="background:linear-gradient(45deg, #fef3c7, #fde68a);border-right:4px solid #f59e0b;padding:16px;border-radius:8px;margin:20px 0;">
                <p style="margin:0;font-size:14px;color:#92400e;">
                  🎯 <strong>هدفنا الخيري:</strong> مع كل تقييم، نساهم في إسعاد يتيم ودعم الأعمال الخيرية!
                </p>
              </div>
            </td>
          </tr>
          
          <!-- CTA Button -->
          <tr>
            <td align="center" style="padding:0 24px 32px 24px;">
              <a href="${data.reviewUrl}" class="review-button" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;padding:16px 32px;border-radius:12px;font-size:16px;font-weight:bold;box-shadow:0 4px 14px 0 rgba(22,163,74,0.35);transition:all 0.2s ease;">
                ⭐ اضغط للتقييم الآن ⭐
              </a>
            </td>
          </tr>
          
          <!-- Alternative Link -->
          <tr>
            <td style="padding:0 24px 24px 24px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#64748b;">
                أو انسخ هذا الرابط: 
                <a href="${data.reviewUrl}" style="color:#0ea5e9;word-break:break-all;">${data.reviewUrl}</a>
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;padding:24px;text-align:right;border-top:1px solid #e2e8f0;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="text-align:right;">
                    <p style="margin:0;font-size:12px;color:#64748b;">
                      شكراً لك على ثقتك 💚<br>
                      <strong style="color:#16a34a;">فريق ثقة</strong>
                    </p>
                  </td>
                  <td style="text-align:left;">
                    <div style="text-align:left;">
                      <span style="font-size:20px;">🌟</span>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
        </table>
        
        <!-- Footer Note -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin-top:16px;">
          <tr>
            <td style="text-align:center;font-size:11px;color:#94a3b8;line-height:1.4;">
              إذا لم تكن أنت المقصود بهذه الرسالة، يمكنك تجاهلها بأمان.<br>
              هذه رسالة آلية من منصة ثقة للتقييمات.
            </td>
          </tr>
        </table>
        
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ✅ Email Plain Text - للـ fallback
export function buildUnifiedEmailText(data: ReviewInviteData): string {
  const name = data.customerName || "عميلنا العزيز";
  const store = data.storeName || "المتجر";
  const product = data.productName;
  
  const productPart = product ? `\nالمنتج: ${product}` : "";
  const orderPart = data.orderNumber ? `\nرقم الطلب: ${data.orderNumber}` : "";
  
  return `مرحباً ${name}!

نتطلع لمعرفة رأيك في تجربة التسوق من ${store}${productPart}${orderPart}

🎯 هدفنا الخيري: مع كل تقييم، نساهم في إسعاد يتيم ودعم الأعمال الخيرية!

⭐ اضغط للتقييم الآن:
${data.reviewUrl}

شكراً لك على ثقتك 💚
فريق ثقة

---
إذا لم تكن أنت المقصود بهذه الرسالة، يمكنك تجاهلها بأمان.`;
}

