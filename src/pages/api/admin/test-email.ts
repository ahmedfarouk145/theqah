import type { NextApiRequest, NextApiResponse } from "next";
import { verifyAdmin } from "@/utils/verifyAdmin";
import { sendEmailDmail } from "@/server/messaging/email-dmail";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const adminCheck = await verifyAdmin(req);
    if (!adminCheck.success) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { 
      to, 
      subject = "رسالة تجريبية من ثقة", 
      message = "هذه رسالة تجريبية لاختبار نظام الإيميل",
      customerName = "العميل",
      storeName = "متجر التجربة",
      reviewUrl = "https://www.theqah.com.sa/review/test123"
    } = req.body;

    if (!to) {
      return res.status(400).json({ 
        error: "Missing required field: to",
        example: { to: "test@example.com" }
      });
    }

    console.log(`[TEST_EMAIL] Sending test email to: ${to}`);

    // Test basic email
    const basicResult = await sendEmailDmail(
      to,
      subject,
      `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
          <h2 style="color:#16a34a;text-align:center">اختبار نظام الإيميل</h2>
          <p>مرحباً،</p>
          <p>${message}</p>
          <div style="background:#f8fafc;padding:15px;margin:20px 0;border-radius:8px">
            <h3>تفاصيل الاختبار:</h3>
            <p><strong>التوقيت:</strong> ${new Date().toLocaleString('ar-SA')}</p>
            <p><strong>النظام:</strong> ثقة - نظام إدارة المراجعات</p>
            <p><strong>البيئة:</strong> ${process.env.NODE_ENV || 'development'}</p>
          </div>
          <p>إذا وصلتك هذه الرسالة، فإن نظام الإيميل يعمل بشكل صحيح! ✅</p>
          <hr style="margin:30px 0;border:none;border-top:1px solid #e2e8f0"/>
          <p style="color:#64748b;font-size:14px;text-align:center">
            فريق ثقة | ${new Date().getFullYear()}
          </p>
        </div>
      `
    );

    // Test review invitation email
    const inviteResult = await sendEmailDmail(
      to,
      "وش رأيك؟ نبي نسمع منك (اختبار)",
      `
        <div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.8;max-width:600px;margin:0 auto;padding:20px">
          <div style="text-align:center;margin-bottom:30px">
            <h2 style="color:#16a34a;margin:0">ثقة</h2>
            <p style="color:#64748b;margin:5px 0">نظام إدارة المراجعات</p>
          </div>
          
          <p>مرحباً <strong>${customerName}</strong>،</p>
          
          <p>طلبك من <strong>${storeName}</strong> تم. شاركنا رأيك لو تكرّمت.</p>
          
          <div style="text-align:center;margin:30px 0">
            <a href="${reviewUrl}" 
               style="background:#16a34a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:bold">
              اضغط للتقييم الآن
            </a>
          </div>
          
          <div style="background:#f1f5f9;padding:15px;border-radius:8px;margin:20px 0">
            <p style="margin:0"><strong>📧 هذه رسالة تجريبية</strong></p>
            <p style="margin:5px 0 0 0;color:#64748b;font-size:14px">
              تم إرسالها لاختبار نظام الإيميل في ${new Date().toLocaleString('ar-SA')}
            </p>
          </div>
          
          <p style="color:#64748b;font-size:14px;text-align:center;margin-top:30px">
            شكراً لك — فريق ثقة
          </p>
        </div>
      `
    );

    console.log(`[TEST_EMAIL] Results - Basic: ${basicResult.ok}, Invite: ${inviteResult.ok}`);

    return res.status(200).json({
      ok: true,
      message: "Email tests completed",
      results: {
        basic: basicResult,
        invite: inviteResult
      },
      config: {
        host: process.env.DMAIL_SMTP_HOST || process.env.EMAIL_HOST || "mailserver.dmail.sa",
        port: process.env.DMAIL_SMTP_PORT || process.env.EMAIL_PORT || 465,
        hasCredentials: !!(process.env.DMAIL_SMTP_USER || process.env.EMAIL_USER) && 
                        !!(process.env.DMAIL_SMTP_PASS || process.env.EMAIL_PASS),
        from: process.env.DMAIL_FROM || process.env.EMAIL_FROM || "ثقة <no-reply@theqah.com.sa>"
      }
    });

  } catch (error) {
    console.error("[TEST_EMAIL] Error:", error);
    return res.status(500).json({ 
      error: "Failed to test email",
      message: error instanceof Error ? error.message : String(error),
      details: error instanceof Error ? error.stack : undefined
    });
  }
}
