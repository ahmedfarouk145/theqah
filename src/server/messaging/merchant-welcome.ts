// src/server/messaging/merchant-welcome.ts
import { sendEmailDmail } from "./email-dmail";

/**
 * إرسال رسالة ترحيب للتاجر مع معلومات الحساب بعد Easy OAuth
 */
export async function sendMerchantWelcomeEmail(options: {
  merchantEmail: string;
  storeName: string;
  storeId: string | number;
  domain?: string;
  accessToken?: string; // نرسل جزء منه للمرجعية فقط
}) {
  const { merchantEmail, storeName, storeId, domain, accessToken } = options;
  
  // إنشاء نسخة آمنة من التوكن للعرض (أول 8 وآخر 4 أحرف)
  const tokenPreview = accessToken 
    ? `${accessToken.slice(0, 8)}...${accessToken.slice(-4)}`
    : 'تم إنشاؤه بنجاح';

  const subject = `🎉 مرحباً بك في ثقة - تم ربط متجر ${storeName} بنجاح`;
  
  const html = `
    <div dir="rtl" style="font-family: 'Tajawal', 'Tahoma', Arial, sans-serif; line-height: 1.8; color: #333; max-width: 600px; margin: 0 auto; background: #f8f9fa;">
      <!-- Header -->
      <div style="background: linear-gradient(135deg, #16a34a 0%, #15803d 100%); padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; font-size: 28px; margin: 0; font-weight: bold;">
          🎉 مرحباً بك في ثقة
        </h1>
        <p style="color: rgba(255,255,255,0.9); font-size: 16px; margin: 10px 0 0 0;">
          منصة إدارة تقييمات العملاء الذكية
        </p>
      </div>

      <!-- Content -->
      <div style="background: white; padding: 40px 30px;">
        <h2 style="color: #16a34a; font-size: 22px; margin-bottom: 20px;">
          تم ربط متجرك بنجاح! ✅
        </h2>
        
        <p style="font-size: 16px; margin-bottom: 25px;">
          مرحباً بك في عائلة ثقة! تم ربط متجرك <strong>${storeName}</strong> بنجاح مع منصة ثقة باستخدام النمط السهل (Easy OAuth).
        </p>

        <!-- Store Info Card -->
        <div style="background: #f8f9fa; border: 2px solid #e9ecef; border-radius: 12px; padding: 25px; margin: 25px 0;">
          <h3 style="color: #495057; font-size: 18px; margin-bottom: 15px; display: flex; align-items: center;">
            📊 معلومات متجرك
          </h3>
          
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #6c757d; width: 30%;">اسم المتجر:</td>
              <td style="padding: 8px 0; color: #343a40;">${storeName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #6c757d;">معرف المتجر:</td>
              <td style="padding: 8px 0; color: #343a40; font-family: monospace;">${storeId}</td>
            </tr>
            ${domain ? `
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #6c757d;">النطاق:</td>
              <td style="padding: 8px 0; color: #343a40;">
                <a href="https://${domain}" style="color: #16a34a; text-decoration: none;">${domain}</a>
              </td>
            </tr>
            ` : ''}
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #6c757d;">حالة الربط:</td>
              <td style="padding: 8px 0; color: #16a34a; font-weight: bold;">✅ مفعل</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #6c757d;">توكن الوصول:</td>
              <td style="padding: 8px 0; color: #6c757d; font-family: monospace; font-size: 12px;">${tokenPreview}</td>
            </tr>
          </table>
        </div>

        <!-- Next Steps -->
        <div style="background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); border-radius: 12px; padding: 25px; margin: 25px 0;">
          <h3 style="color: #495057; font-size: 18px; margin-bottom: 15px;">🚀 الخطوات التالية</h3>
          <ul style="margin: 0; padding-right: 20px; color: #495057;">
            <li style="margin-bottom: 10px;">انتقل إلى <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://www.theqah.com.sa'}/dashboard" style="color: #16a34a; text-decoration: none; font-weight: bold;">لوحة التحكم</a> لإدارة إعدادات متجرك</li>
            <li style="margin-bottom: 10px;">راجع إعدادات الرسائل وخصص رسائل التقييم</li>
            <li style="margin-bottom: 10px;">قم بتركيب ودجت التقييمات في متجرك (متوفر في قسم الإعدادات)</li>
            <li style="margin-bottom: 10px;">راقب تقييمات عملائك وحسن من خدماتك</li>
          </ul>
        </div>

        <!-- CTA Button -->
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://www.theqah.com.sa'}/dashboard" 
             style="display: inline-block; background: linear-gradient(135deg, #16a34a 0%, #15803d 100%); color: white; text-decoration: none; padding: 15px 30px; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 15px rgba(22, 163, 74, 0.3);">
            🎛️ فتح لوحة التحكم
          </a>
        </div>

        <!-- Support -->
        <div style="background: #fff3cd; border: 1px solid #ffeeba; border-radius: 8px; padding: 20px; margin: 25px 0;">
          <h4 style="color: #856404; margin-bottom: 10px;">💬 هل تحتاج مساعدة؟</h4>
          <p style="color: #856404; margin: 0; font-size: 14px;">
            فريق الدعم متاح لمساعدتك في أي وقت على البريد الإلكتروني: 
            <a href="mailto:support@theqah.com.sa" style="color: #856404; font-weight: bold;">support@theqah.com.sa</a>
          </p>
        </div>
      </div>

      <!-- Footer -->
      <div style="background: #343a40; color: white; padding: 25px 30px; text-align: center; border-radius: 0 0 12px 12px;">
        <p style="margin: 0; font-size: 14px; opacity: 0.8;">
          © ${new Date().getFullYear()} منصة ثقة - جميع الحقوق محفوظة
        </p>
        <p style="margin: 5px 0 0 0; font-size: 12px; opacity: 0.6;">
          تم إرسال هذا الإيميل تلقائياً بعد ربط متجرك بنجاح
        </p>
      </div>
    </div>
  `;

  try {
    const result = await sendEmailDmail(merchantEmail, subject, html);
    return result;
  } catch (error) {
    console.error('فشل في إرسال إيميل الترحيب للتاجر:', error);
    return { ok: false, error: (error as Error).message };
  }
}