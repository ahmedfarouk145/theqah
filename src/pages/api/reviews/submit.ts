// src/pages/api/reviews/submit.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { getDb } from "@/server/firebase-admin";
import { moderateReview } from "@/server/moderation";
//eslint-disable-next-line @typescript-eslint/no-unused-vars
import { getReviewTokenById } from "@/server/review-tokens";

type ReviewBody = {
  orderId: string;
  stars: number;
  text?: string;
  images?: string[]; // Uploadcare CDN URLs
  tokenId?: string;  // توكن الدعوة (اختياري، لكن لو موجود لازم يتحقق)
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}
function isImagesArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((u) => typeof u === "string" && u.length > 0);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  try {
    const raw = req.body as Partial<ReviewBody>;
    if (typeof raw !== "object" || raw === null) return res.status(400).json({ error: "Invalid body" });

    const { orderId, stars, text, images, tokenId } = raw;

    if (!isNonEmptyString(orderId)) return res.status(400).json({ error: "orderId is required" });

    const s = Number(stars);
    if (!Number.isFinite(s) || s < 1 || s > 5) return res.status(400).json({ error: "stars must be 1..5" });

    if (images !== undefined && !isImagesArray(images)) return res.status(400).json({ error: "images must be string[]" });

    const imgs = isImagesArray(images) ? images : [];
    const UCARE = /^https:\/\/ucarecdn\.com\//;
    const safeImages = imgs.filter((u) => UCARE.test(u));

    // قيم افتراضية لو مفيش توكن
    let storeUid: string | null = null;
    let productId: string | null = null;
    let trustedBuyer = false;

    const db = getDb();
    const nowMs = Date.now();

    // هنكتب التقييم ونعلم usedAt داخل Transaction لضمان one-time use
    const result = await db.runTransaction(async (tx) => {
      // لو مفيش tokenId: اسمح بالتقييم (غير موثق) بدون ربط دعوة
      if (!isNonEmptyString(tokenId)) {
        const reviewId = db.collection("reviews").doc().id;
        tx.set(db.collection("reviews").doc(reviewId), {
          id: reviewId,
          orderId,
          stars: s,
          text: isNonEmptyString(text) ? String(text) : "",
          images: safeImages,
          tokenId: null,
          storeUid: null,
          productId: null,
          status: "published",
          published: true,
          publishedAt: nowMs,
          trustedBuyer: false,
          platform: "web",          // بدل "salla" الثابتة
          createdAt: nowMs,
          moderation: null,         // هنحدّثها بعد الموديريشن تحت
        }, { merge: false });
//eslint-disable-next-line @typescript-eslint/no-explicit-any
        return { reviewId, usedToken: false, tok: null as any };
      }

      // لو فيه tokenId: لازم نتحقق منه ومن حالته ونقفل السباق
      const tokenRef = db.collection("review_tokens").doc(String(tokenId));
      const tokenSnap = await tx.get(tokenRef);
      if (!tokenSnap.exists) {
        throw new Error("token_not_found");
      }
      //eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tok = tokenSnap.data() as any;

      // حقل expiry/voided/usedAt
      if (tok.usedAt) throw new Error("token_already_used");
      if (tok.voided) throw new Error("token_voided");
      if (tok.expiresAt && nowMs > Number(tok.expiresAt)) throw new Error("token_expired");

      // توافق البيانات: اربط الدعوة بالاوردر والمنتج والمتجر
      if (tok.orderId && String(tok.orderId) !== String(orderId)) {
        throw new Error("token_order_mismatch");
      }

      storeUid = tok.storeUid ?? null;
      productId = tok.productId ?? null;
      trustedBuyer = true;

      // أنشئ review داخل نفس الـ TX
      const reviewId = db.collection("reviews").doc().id;
      tx.set(db.collection("reviews").doc(reviewId), {
        id: reviewId,
        orderId,
        stars: s,
        text: isNonEmptyString(text) ? String(text) : "",
        images: safeImages,
        tokenId: String(tokenId),
        storeUid,
        productId,
        status: "published",
        published: true,
        publishedAt: nowMs,
        trustedBuyer,
        platform: "web",           // أو "salla"/"zid" لو بتعرفها من السياق
        createdAt: nowMs,
        moderation: null,          // هنحدّثها بعد الموديريشن تحت
      }, { merge: false });

      // علّم التوكن مستخدم داخل نفس الـ TX لمنع أي سباق
      tx.update(tokenRef, { usedAt: nowMs });

      // ممكن تحدّث order كمان لو محتاج (اختياري):
      // if (tok.orderId) tx.update(db.collection('orders').doc(String(tok.orderId)), { reviewSubmitted: true });

      return { reviewId, usedToken: true, tok };
    });

    // ★ الموديريشن بعد إنشاء/تأمين الـ TX (لتقليل زمن القفل)
    const mod = await moderateReview({
      text: isNonEmptyString(text) ? String(text) : "",
      images: safeImages,
      stars: s,
    });

    if (!mod.ok) {
      // لو عايز تعتبرها مرفوضة: تحدث التقييم وتخلي status=rejected (بدل حذف)
      await db.collection("reviews").doc(result.reviewId).set({
        status: "rejected",
        published: false,
        moderation: {
          model: mod.model,
          score: mod.score,
          flags: mod.flags,
          reason: mod.reason || "review_rejected",
        },
      }, { merge: true });

      return res.status(400).json({ ok: false, rejected: true, reason: mod.reason || "review_rejected" });
    }

    // تحديث بيانات الموديريشن على التقييم
    await db.collection("reviews").doc(result.reviewId).set({
      moderation: {
        model: mod.model,
        score: mod.score,
        flags: mod.flags,
      },
    }, { merge: true });

    return res.status(201).json({
      ok: true,
      id: result.reviewId,
      published: true,
      trustedBuyer,
    });
//eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    const msg = typeof e?.message === "string" ? e.message : String(e);

    // خرائط أخطاء مفهومة للفرونت
    if (msg === "token_not_found")       return res.status(400).json({ ok: false, error: "token_not_found" });
    if (msg === "token_already_used")    return res.status(409).json({ ok: false, error: "token_already_used" });
    if (msg === "token_expired")         return res.status(410).json({ ok: false, error: "token_expired" });
    if (msg === "token_voided")          return res.status(410).json({ ok: false, error: "token_voided" });
    if (msg === "token_order_mismatch")  return res.status(400).json({ ok: false, error: "token_order_mismatch" });

    return res.status(500).json({ error: "internal_error", message: msg });
  }
}
