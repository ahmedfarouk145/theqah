// src/lib/oursms.ts
import { trackSMS } from "@/server/monitoring/metrics";

export type SmsPayload = { to: string; body: string };

const BASE = process.env.OURSMS_BASE_URL || 'https://oursms.app/api/v1';
const API_KEY = process.env.OURSMS_API_KEY!; // Bearer

export async function sendOneSMS({ to, body }: SmsPayload) {
  const startTime = Date.now();
  const url = `${BASE}/SMS/Add/SendOneSms`; // وفق الـ Postman v1
  
  try {
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

    const duration = Date.now() - startTime;

    if (!res.ok) {
      const text = await res.text();
      const error = `OurSMS failed: ${res.status} ${text}`;
      
      // H7: Track SMS failure
      await trackSMS({
        to,
        success: false,
        error,
        duration,
        metadata: { statusCode: res.status }
      });
      
      throw new Error(error);
    }
    
    const result = await res.json();
    
    // H7: Track SMS success
    await trackSMS({
      to,
      success: true,
      duration,
      metadata: { provider: 'OurSMS' }
    });
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    // H7: Track SMS exception
    await trackSMS({
      to,
      success: false,
      error: errorMsg,
      duration
    });
    
    throw error;
  }
}
