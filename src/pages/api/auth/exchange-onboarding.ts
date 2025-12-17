import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin, authAdmin } from "@/lib/firebaseAdmin";

type Body = { tokenId?: string; email?: string; password?: string };

type OnboardingDoc = {
  id?: string;
  storeUid?: string;               // "salla:123" (الأفضل)
  uid?: string;                    // للتوافق
  store?: { id?: number | string } | null;
  usedAt?: number | null;
  expiresAt?: number | null;
};

type Ok = { ok: true; userUid: string; storeUid: string; customToken: string };
type Err = { ok: false; error: string };

function msg(e: unknown) { return e instanceof Error ? e.message : String(e); }
function resolveStoreUid(d: OnboardingDoc | undefined): string | null {
  if (!d) return null;
  if (d.storeUid) return d.storeUid;
  if (d.uid && d.uid.startsWith("salla:")) return d.uid;
  const rawId = d.store?.id;
  if (rawId != null) return `salla:${String(rawId)}`;
  return null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<Ok | Err>) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method Not Allowed" });

  try {
    const { tokenId, email, password } = (req.body || {}) as Body;
    if (!tokenId) return res.status(400).json({ ok: false, error: "tokenId is required" });
    if (!password || password.length < 6) {
      return res.status(400).json({ ok: false, error: "Password must be at least 6 characters" });
    }

    const db = dbAdmin();
    const adminAuth = authAdmin();

    // 1) اقرأ توكن الـ onboarding
    const tokSnap = await db.collection("onboarding_tokens").doc(tokenId).get();
    if (!tokSnap.exists) return res.status(401).json({ ok: false, error: "Invalid onboarding token" });

    const tok = tokSnap.data() as OnboardingDoc | undefined;
    if (tok?.usedAt) return res.status(401).json({ ok: false, error: "Token already used" });
    if (tok?.expiresAt && Date.now() > tok.expiresAt) {
      return res.status(401).json({ ok: false, error: "Token expired" });
    }

    const storeUid = resolveStoreUid(tok);
    if (!storeUid) return res.status(400).json({ ok: false, error: "Cannot resolve storeUid" });

    // 2) أنشئ/حدّث مستخدم Firebase
    let userUid: string;
    if (email) {
      const existing = await adminAuth.getUserByEmail(email).catch(() => null);
      if (existing) {
        userUid = existing.uid;
        await adminAuth.updateUser(userUid, { password, emailVerified: true, disabled: false });
      } else {
        const created = await adminAuth.createUser({ email, password, emailVerified: true, disabled: false });
        userUid = created.uid;
      }
    } else {
      const created = await adminAuth.createUser({ disabled: false });
      userUid = created.uid;
    }

    // 3) ثبّت الملكية على المستند الحقيقي
    await db.collection("stores").doc(storeUid).set({
      uid: storeUid,
      platform: "salla",
      ownerUid: userUid,
      updatedAt: Date.now(),
    }, { merge: true });

    // ✅ 4) اكتب alias على stores/{ownerUid} → storeUid
    await db.collection("stores").doc(userUid).set({
      ownerUid: userUid,
      platform: "salla",
      storeUid,               // يشير للمستند الحقيقي
      updatedAt: Date.now(),
    }, { merge: true });

    // (اختياري) ربط عكسي
    await db.collection("owners").doc(userUid).collection("stores").doc(storeUid)
      .set({ platform: "salla", linkedAt: Date.now() }, { merge: true })
      .catch((err) => {
        console.error('[Auth] Failed to delete onboarding state:', err);
      });

    // علّم التوكن كمستخدم
    await tokSnap.ref.set({ usedAt: Date.now(), ownerUid: userUid, storeUid }, { merge: true });

    // 5) custom token
    const customToken = await adminAuth.createCustomToken(userUid);
    return res.status(200).json({ ok: true, userUid, storeUid, customToken });
  } catch (e) {
    return res.status(500).json({ ok: false, error: msg(e) });
  }
}
