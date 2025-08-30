// src/lib/salla/verify.ts
import crypto from "crypto";
import type { NextApiRequest } from "next";

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "missing-header" | "missing-secret" | "bad-strategy" | "bad-signature" };

export function verifySallaSignature(
  headers: NextApiRequest["headers"],
  rawBody: Buffer,
  secret: string
): VerifyResult {
  const strategy =
    (headers["x-salla-security-strategy"] as string | undefined) ??
    (headers["x-salla-security-strategy".toLowerCase()] as string | undefined);
  const signature =
    (headers["x-salla-signature"] as string | undefined) ??
    (headers["x-salla-signature".toLowerCase()] as string | undefined);

  if (!strategy || !signature) return { ok: false, reason: "missing-header" };
  if (!secret) return { ok: false, reason: "missing-secret" };
  if (String(strategy).toLowerCase() !== "signature") return { ok: false, reason: "bad-strategy" };

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(signature, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: "bad-signature" };

  return { ok: true };
}
