// src/utils/email.ts
import nodemailer from 'nodemailer';
import { trackEmail } from "@/server/monitoring/metrics";

type EmailData = {
  to?: string;
  name: string;
  storeName: string;
  reviewLink: string;
};

export async function sendEmail({ to, name, storeName, reviewLink }: EmailData) {
  if (!to) return;

  const startTime = Date.now();
  const subject = 'وش رأيك نبي نسمع منك';

  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST!,
    port: Number(process.env.EMAIL_PORT!),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER!,
      pass: process.env.EMAIL_PASS!,
    },
  });

  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM!,
      to,
      subject,
      html: `
        <div dir="rtl" style="font-family:Tahoma, sans-serif">
          <p>ياهلا والله ${name}</p>
          <p>طلبك من <strong>${storeName}</strong> وصلنا وإن شاء الله كان كل شي على قد رضاك</p>
          <p>لو تكرمت عطنا تقييم بسيط يساعدنا نتحسن ويساعد غيرك يعرف وش اللي قدامه.</p>
          <p><a href="${reviewLink}" style="background-color:#4CAF50;color:white;padding:10px 20px;text-decoration:none;border-radius:4px;">اضغط هنا وسجل رأيك</a></p>
          <p>وإذا كنت شريت فعليا بنحط بجنب تقييمك علامة "مشتري ثقة"</p>
          <p>شاكرين ومقدرين لك<br>فريق ثقة</p>
          <small>theqah.com.sa</small>
        </div>
      `,
    });

    const duration = Date.now() - startTime;

    // H8: Track email success
    await trackEmail({
      to,
      subject,
      success: true,
      duration,
      messageId: info.messageId,
      metadata: {
        type: 'review_invitation',
        storeName
      }
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);

    // H8: Track email failure
    await trackEmail({
      to,
      subject,
      success: false,
      error: errorMsg,
      duration,
      metadata: {
        type: 'review_invitation',
        storeName
      }
    });

    throw error;
  }
}
