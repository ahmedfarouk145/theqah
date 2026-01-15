import { dbAdmin } from '@/lib/firebaseAdmin';

export function normalizeMsisdn(phone: string): string {
  let s = (phone || '').replace(/[^\d+]/g, '');
  if (!s) return '';
  if (s.startsWith('00')) s = s.slice(2);
  if (s.startsWith('+')) s = s.slice(1);
  if (s.startsWith('0')) s = '966' + s.slice(1);        // SA leading 0 => 966
  if (/^[5]\d{8}$/.test(s)) s = '966' + s;              // local 9 digits starting 5
  return s;
}

export async function isOptedOut(phone: string): Promise<boolean> {
  const p = normalizeMsisdn(phone);
  if (!p) return true;
  const doc = await dbAdmin().collection('optouts_sms').doc(p).get();
  return doc.exists;
}
