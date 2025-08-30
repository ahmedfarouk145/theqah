// src/server/messaging/sms-length.ts
const GSM7 =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\u0020!\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";

function isGsm7(s: string): boolean {
  for (const ch of s) if (!GSM7.includes(ch)) return false;
  return true;
}

export function estimateSegments(
  s: string
): { segments: number; encoding: 'GSM-7' | 'UCS-2' } {
  const gsm = isGsm7(s);
  const single = gsm ? 160 : 70;
  const concat = gsm ? 153 : 67;
  if (s.length <= single) return { segments: 1, encoding: gsm ? 'GSM-7' : 'UCS-2' };
  const segs = Math.ceil(s.length / concat);
  return { segments: segs, encoding: gsm ? 'GSM-7' : 'UCS-2' };
}
