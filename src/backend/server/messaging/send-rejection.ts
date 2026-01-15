// src/server/messaging/send-rejection.ts
import { sendSms } from "./send-sms";

import { sendEmailDmail as sendEmail } from "./email-dmail";

export async function notifyRejection({
  phone,
  email,
  name,
  storeName,
  reasonKey, // abuse | spam | irrelevant | policy | image_policy ...
}: {
  phone?: string;
  email?: string;
  name?: string;
  storeName?: string;
  reasonKey: string;
}) {
  const n = name || "عميلنا العزيز";
  const s = storeName || "متجرنا";
  const reasonMap: Record<string, string> = {
    abuse: "لوجود ألفاظ غير لائقة",
    spam: "لاشتمالها على روابط/محتوى غير مناسب",
    irrelevant: "لعدم ارتباطها بالتجربة",
    policy: "لمخالفتها معايير النشر",
    image_policy: "لاحتواء الصور على محتوى غير مناسب",
  };
  const why = reasonMap[reasonKey] || "لمخالفتها معايير النشر";

  const smsText = `مرحباً ${n}، نشكرك على وقتك. نأسف لإعلامك بأن مراجعتك لم يتم نشرها ${why}. يسعدنا استقبال نسخة منقّحة وسنقوم بمراجعتها مرة أخرى.`;
  const emailHtml = `
    <div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.7">
      <p>مرحباً ${n}،</p>
      <p>شكرًا لمشاركتك رأيك حول ${s}. بعد المراجعة، تعذّر نشر التقييم ${why}.</p>
      <p>نقدّر ملاحظاتك كثيرًا، ويمكنك إرسال نسخة منقّحة ليتسنى لنا قبولها.</p>
      <p style="color:#64748b">مع خالص التقدير</p>
    </div>
  `;

  const tasks: Array<Promise<unknown>> = [];
  if (phone) {
    
    tasks.push(sendSms(phone, smsText));
  }
  if (email) {
    tasks.push(sendEmail(email, "اعتذار بخصوص نشر التقييم", emailHtml));
  }
  await Promise.allSettled(tasks);
}
