// src/server/messaging/send-sms.ts
import { normalizeMsisdn, isOptedOut } from './phone';
import { info, warn, error } from '@/lib/logger';

type SmsResult = { ok: boolean; provider?: string; id?: string | null; error?: string };

const BASE   = process.env.OURSMS_BASE_URL || 'https://oursms.app/api/v1';
const KEY    = process.env.OURSMS_API_KEY || '';
const SENDER = process.env.OURSMS_SENDER || ''; // اختياري حسب حسابك

async function sendOnce(to: string, body: string): Promise<SmsResult> {
  if (!KEY) return { ok:false, provider:'oursms', error:'Missing OURSMS_API_KEY' };
  // بعض الحسابات تحتاج sender
  //eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload: Record<string, any> = { phoneNumber: to, body };
  if (SENDER) payload.sender = SENDER;

  const resp = await fetch(`${BASE}/SMS/Add/SendOneSms`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(payload),
  });

  const text = await resp.text();
  //eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any = null;
  try { data = JSON.parse(text); } catch { /* مش مشكلة لو مش JSON */ }

  // نجاح HTTP لا يعني نجاح الإرسال عند بعض المزودين
  if (!resp.ok) {
    return { ok:false, provider:'oursms', error:`HTTP ${resp.status} ${text.slice(0,300)}` };
  }

  // لو فيه هيكل بيانات يوحي بالنجاح/الفشل، افحصه
  // أمثلة افتراضية: { isSuccessful: true, data: { messageId: '...' } }
  const isSuccessful = data?.isSuccessful ?? data?.success ?? true; // fallback → true لو مش عارفين
  if (!isSuccessful) {
    const msg = data?.message || data?.errorMessage || text.slice(0,300) || 'Unknown provider error';
    return { ok:false, provider:'oursms', error: msg };
  }

  const id = data?.data?.messageId || data?.messageId || null;
  return { ok:true, provider:'oursms', id };
}

export async function sendSms(rawTo: string, message: string): Promise<SmsResult> {
  const to = normalizeMsisdn(rawTo); // تأكد إنها بترجع E.164 (+966...)
  if (!to || !message) return { ok:false, error:'Missing to/message' };
  if (await isOptedOut(to)) { warn('sms.optout', { to }); return { ok:false, error:'Opted-out' }; }

  const max = 3;
  for (let i=1;i<=max;i++){
    const r = await sendOnce(to, message);
    if (r.ok) { info('sms.sent', { to, provider:r.provider, id:r.id }); return r; }
    warn('sms.retry', { to, attempt:i, error:r.error?.slice(0,300) });
    await new Promise(res=>setTimeout(res, 400 * i)); // backoff بسيط
  }
  error('sms.failed', { to });
  return { ok:false, error:'Failed after retries' };
}
