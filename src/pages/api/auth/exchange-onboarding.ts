// src/pages/api/auth/exchange-onboarding.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin, authAdmin } from "@/lib/firebaseAdmin";

type PostBody = {
  tokenId?: string;
  email?: string;
  password?: string;
};

type OnboardingTokenDoc = {
  uid?: string;
  used?: boolean;
  expiresAt?: number; // ms epoch
};

type Success = { ok: true; uid: string; customToken: string };
type Failure = { ok: false; error: string };

function asErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Success | Failure>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  try {
    const { tokenId, email, password } = (req.body || {}) as PostBody;

    if (!tokenId || typeof tokenId !== "string") {
      return res.status(400).json({ ok: false, error: "tokenId is required" });
    }
    if (!password || typeof password !== "string" || password.length < 6) {
      return res
        .status(400)
        .json({ ok: false, error: "Password must be at least 6 characters" });
    }
    if (email && typeof email !== "string") {
      return res.status(400).json({ ok: false, error: "Invalid email" });
    }

    // (اختياري قوي لكن مُستحسن): التحقق من صلاحية tokenId
    let uidFromToken: string | undefined;
    try {
      const snap = await dbAdmin()
        .collection("onboarding_tokens")
        .doc(tokenId)
        .get();

      if (!snap.exists) {
        return res.status(401).json({ ok: false, error: "Invalid tokenId" });
      }

      const data = snap.data() as OnboardingTokenDoc | undefined;
      if (data?.used) {
        return res.status(401).json({ ok: false, error: "Token already used" });
      }
      if (data?.expiresAt && Date.now() > data.expiresAt) {
        return res.status(401).json({ ok: false, error: "Token expired" });
      }
      uidFromToken = data?.uid;
    } catch (e: unknown) {
      // لو ما عندك كوليكشن للتحقق، ممكن تشيل البلوك ده كله
      return res
        .status(500)
        .json({ ok: false, error: `Token check failed: ${asErrorMessage(e)}` });
    }

    const adminAuth = authAdmin();

    // هنحدد الـ uid النهائي اللي هنشتغل عليه
    let uid: string | undefined;

    // لو التوكن مربوط مسبقًا بـ uid
    if (uidFromToken) {
      uid = uidFromToken;

      if (email) {
        try {
          // لو الإيميل موجود على مستخدم آخر → ندمج على uid صاحب الإيميل
          const byEmail = await adminAuth.getUserByEmail(email).catch(() => null);
          if (byEmail && byEmail.uid !== uid) {
            uid = byEmail.uid;
          }

          // هل يوجد مستخدم بنفس uid؟
          const existing = await adminAuth.getUser(uid).catch(() => null);
          if (existing) {
            await adminAuth.updateUser(uid, {
              email,
              password,
              emailVerified: true,
              disabled: false,
            });
          } else {
            await adminAuth.createUser({
              uid,
              email,
              password,
              emailVerified: true,
              disabled: false,
            });
          }
        } catch (e: unknown) {
          return res.status(400).json({
            ok: false,
            error: `Failed to upsert user (uidFromToken): ${asErrorMessage(e)}`,
          });
        }
      } else {
        // بدون إيميل: نتأكد على الأقل من وجود المستخدم
        const existing = await adminAuth.getUser(uid).catch(() => null);
        if (!existing) {
          await adminAuth.createUser({ uid, disabled: false }).catch((e: unknown) => {
            throw new Error(`Failed to create user (no email): ${asErrorMessage(e)}`);
          });
        }
      }
    } else {
      // لا يوجد uid من التوكن → نقرر حسب الإيميل
      if (email) {
        try {
          const byEmail = await adminAuth.getUserByEmail(email).catch(() => null);
          if (byEmail) {
            uid = byEmail.uid;
            await adminAuth.updateUser(uid, {
              password,
              emailVerified: true,
              disabled: false,
            });
          } else {
            const created = await adminAuth.createUser({
              email,
              password,
              emailVerified: true,
              disabled: false,
            });
            uid = created.uid;
          }
        } catch (e: unknown) {
          return res.status(400).json({
            ok: false,
            error: `Failed to create/update user by email: ${asErrorMessage(e)}`,
          });
        }
      } else {
        // لا uid ولا email → ننشئ حساب بدون إيميل (لو يناسب فلوك)
        try {
          const created = await adminAuth.createUser({ disabled: false });
          uid = created.uid;
        } catch (e: unknown) {
          return res.status(400).json({
            ok: false,
            error: `Failed to create user (no email): ${asErrorMessage(e)}`,
          });
        }
      }
    }

    if (!uid) {
      return res.status(500).json({ ok: false, error: "Failed to resolve uid" });
    }

    // علِّم التوكن كمستخدم (used) — اختياري
    try {
      await dbAdmin()
        .collection("onboarding_tokens")
        .doc(tokenId)
        .set({ uid, used: true, usedAt: Date.now() }, { merge: true });
    } catch {
      // لا توقف بسبب فشل ثانوي
    }

    // أنشئ custom token لتسجيل الدخول الفوري من العميل
    const customToken = await adminAuth.createCustomToken(uid);

    return res.status(200).json({ ok: true, uid, customToken });
  } catch (e: unknown) {
    return res
      .status(500)
      .json({ ok: false, error: asErrorMessage(e) || "Internal Server Error" });
  }
}
