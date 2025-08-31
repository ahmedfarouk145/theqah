// src/pages/api/reviews/submit.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin"; // استخدم نفس util المؤكد عندك
// لو عندك getDb ويشتغل تمام استخدمه بدل dbAdmin().firestore()
import { moderateReview } from "@/server/moderation"; // هنخليها اختيارية

type ReviewBody = {
  orderId?: string;
  stars?: number;
  text?: string;
  images?: string[];
  tokenId?: string;
  platform?: "salla" | "zid" | "manual" | "web";
};

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;

const isImagesArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((u) => typeof u === "string" && u.length > 0);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  try {
    const body: ReviewBody = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const { orderId, stars, text, images, tokenId, platform } = body;

    if (!isNonEmptyString(orderId)) return res.status(400).json({ error: "missing_orderId" });
    const s = Number(stars);
    if (!Number.isFinite(s) || s < 1 || s > 5) return res.status(400).json({ error: "invalid_stars" });
    if (images !== undefined && !isImagesArray(images)) return res.status(400).json({ error: "images_must_be_array" });

    const imgs = isImagesArray(images) ? images : [];
    const safeImages = imgs.filter((u) => /^https:\/\/ucarecdn\.com\//.test(u)).slice(0, 10);
    const now = Date.now();

    const db = dbAdmin(); // Firestore Admin instance

    const result = await db.runTransaction(async (tx) => {
      // لو مفيش tokenId: نسجّل تقييم غير موثّق (trustedBuyer=false)
      if (!isNonEmptyString(tokenId)) {
        const reviewRef = db.collection("reviews").doc();
        tx.set(reviewRef, {
          id: reviewRef.id,
          orderId,
          stars: s,
          text: isNonEmptyString(text) ? text : "",
          images: safeImages,
          tokenId: null,
          storeUid: null,
          productId: null,
          platform: platform || "web",
          trustedBuyer: false,
          status: "published",
          published: true,
          publishedAt: now,
          createdAt: now,
          moderation: null,
        });
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
        return { reviewId: reviewRef.id, tok: null as any };
      }

      // مع وجود tokenId: تحقق صارم
      const tokRef = db.collection("review_tokens").doc(String(tokenId));
      const tokSnap = await tx.get(tokRef);
      if (!tokSnap.exists) throw new Error("token_not_found");
      //eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tok = tokSnap.data() as any;

      if (tok.usedAt) throw new Error("token_already_used");
      if (tok.voidedAt || tok.voided) throw new Error("token_voided");
      if (tok.expiresAt && now > Number(tok.expiresAt)) throw new Error("token_expired");

      if (tok.orderId && String(tok.orderId) !== String(orderId)) {
        throw new Error("token_order_mismatch");
      }

      // منع تكرار تقييم لنفس orderId (اختياري لكن مفيد)
      const dup = await db.collection("reviews").where("orderId", "==", String(orderId)).limit(1).get();
      if (!dup.empty) throw new Error("duplicate_review");

      const reviewRef = db.collection("reviews").doc();
      tx.set(reviewRef, {
        id: reviewRef.id,
        orderId,
        stars: s,
        text: isNonEmptyString(text) ? text : "",
        images: safeImages,
        tokenId: String(tokenId),
        storeUid: tok.storeUid ?? null,
        productId: tok.productId ?? null,
        productIds: tok.productIds ?? [],
        platform: platform || tok.platform || "web",
        trustedBuyer: true,
        status: "published",
        published: true,
        publishedAt: now,
        createdAt: now,
        moderation: null,
      });
      tx.update(tokRef, { usedAt: now });

      return { reviewId: reviewRef.id, tok };
    });

    // الموديريشن — خليها “لا تمنع” لو وقعت
    try {
      const mod = await moderateReview({
        text: isNonEmptyString(body.text) ? body.text : "",
        images: safeImages,
        stars: s,
      });
      await db.collection("reviews").doc(result.reviewId).set(
        mod?.ok
          ? { moderation: { model: mod.model, score: mod.score, flags: mod.flags } }
          : { moderation: { model: mod?.model || "none", score: mod?.score ?? 0, flags: mod?.flags ?? ["failed"], reason: mod?.reason || "moderation_failed" } },
        { merge: true }
      );
      // لو عايز تمنع بدل ما تسجل، رجّع 400 هنا بدل set فقط.
    } catch {
      await db.collection("reviews").doc(result.reviewId).set(
        { moderation: { model: "none", score: 0, flags: ["moderation_error"] } },
        { merge: true }
      );
    }

    return res.status(201).json({ ok: true, id: result.reviewId, published: true });
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    const msg = String(e?.message || e || "error");

    // خريطة أخطاء واضحة للفورنت
    if (msg === "token_not_found")       return res.status(400).json({ error: "token_not_found" });
    if (msg === "token_already_used")    return res.status(409).json({ error: "token_already_used" });
    if (msg === "token_expired")         return res.status(410).json({ error: "token_expired" });
    if (msg === "token_voided")          return res.status(410).json({ error: "token_voided" });
    if (msg === "token_order_mismatch")  return res.status(400).json({ error: "token_order_mismatch" });
    if (msg === "duplicate_review")      return res.status(409).json({ error: "duplicate_review" });

    console.error("reviews/submit error:", e);
    return res.status(500).json({ error: "internal_error" });
  }
}
