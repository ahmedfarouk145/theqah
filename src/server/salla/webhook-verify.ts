import crypto from "crypto";

/**
 * Salla ترسل:
 *  - X-Salla-Security-Strategy: Signature
 *  - X-Salla-Signature: sha256 HMAC of raw body using webhook secret (hex, 64 chars)
 */
export function verifySallaWebhook(rawBody: Buffer, headerSignature: string | undefined) {
  const secret = process.env.SALLA_WEBHOOK_SECRET || "";
  if (!secret || !headerSignature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(headerSignature, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** اصنع مفتاح Idempotency ثابت من التوقيع + حجم/هاش البودي */
export function makeIdemKey(signature: string | undefined, rawBody: Buffer) {
  const h = crypto.createHash("sha256").update(`${signature || ""}|`).update(rawBody).digest("hex");
  return h; // 64-hex
}
