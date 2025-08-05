// src/utils/sms.ts
import twilio from 'twilio';

const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

export async function sendSMS(phone: string, name: string, storeName: string, reviewLink: string) {
  const message = `هلا ${name}،\n\nيعطيك العافية على طلبك من ${storeName}\n\nوش رايك تشاركنا رأيك؟\nاضغط وسجل تقييمك:\n${reviewLink}\n\nكلمتك تهمنا وتفيد غيرك`;

  await client.messages.create({
    to: phone,
    from: process.env.TWILIO_SENDER_ID!,
    body: message,
  });
}
