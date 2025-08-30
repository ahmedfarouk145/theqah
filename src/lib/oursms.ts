// src/lib/oursms.ts
export type SmsPayload = { to: string; body: string };

const BASE = process.env.OURSMS_BASE_URL || 'https://oursms.app/api/v1';
const API_KEY = process.env.OURSMS_API_KEY!; // Bearer

export async function sendOneSMS({ to, body }: SmsPayload) {
  const url = `${BASE}/SMS/Add/SendOneSms`; // وفق الـ Postman v1
  // ان وجدت صيغة مختلفة ببوابتك (OTP/templating) بدّل الإندبوينت
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      phoneNumber: to,
      body,
      // senderName: process.env.OURSMS_SENDER_NAME, // لو مطلوبة ومفعّلة
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OurSMS failed: ${res.status} ${text}`);
  }
  return res.json();
}
