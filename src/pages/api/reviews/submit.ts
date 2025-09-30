import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";
import { moderateReview } from "@/server/moderation";

type ReviewBody = {
  orderId?: string;
  stars?: number;
  text?: string;
  images?: string[];
  tokenId?: string;
  platform?: "salla" | "zid" | "manual" | "web";
  authorName?: string | null;
  authorShowName?: boolean;
};

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;

const isImagesArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((u) => typeof u === "string" && u.length > 0);

// -------- Helpers: sanitize/mask --------
function sanitizeName(raw?: string | null) {
  if (!raw) return "";
  return String(raw).trim().replace(/[^\p{L}\p{N}\s.'’_-]/gu, "").slice(0, 60);
}
function maskName(clean: string) {
  if (!clean) return "عميل المتجر";
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "عميل المتجر";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1][0]}.`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  try {
    const body: ReviewBody =
      typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const { orderId, stars, text, images, tokenId, platform, authorName, authorShowName } = body;

    if (!isNonEmptyString(orderId)) return res.status(400).json({ error: "missing_orderId" });
    const s = Number(stars);
    if (!Number.isFinite(s) || s < 1 || s > 5) return res.status(400).json({ error: "invalid_stars" });
    if (images !== undefined && !isImagesArray(images)) return res.status(400).json({ error: "images_must_be_array" });

    const imgs = isImagesArray(images) ? images : [];
    const safeImages = imgs.filter((u) => /^https:\/\/ucarecdn\.com\//.test(u)).slice(0, 10);

    // author.{show,name,displayName}
    const cleanName = sanitizeName(authorName);
    const author = {
      show: !!authorShowName && !!cleanName,
      name: cleanName || null,
      displayName: (!!authorShowName && cleanName) ? cleanName : maskName(cleanName),
    };

    const now = Date.now();
    const db = dbAdmin();

    // ننشئ التقييم كـ pending وغير منشور، ثم نقرر النشر بعد الموديريشن
    const txResult = await db.runTransaction(async (tx) => {
      // بدون tokenId ⇒ غير موثّق
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
          status: "pending",
          published: false,
          publishedAt: null,
          createdAt: now,
          author,
          moderation: null,
        });
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
        return { reviewId: reviewRef.id, tok: null as any };
      }

      // مع tokenId: تحقق صارم
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

      // منع تكرار تقييم لنفس orderId (داخل الترانزاكشن)
      const dup = await tx.get(
        db.collection("reviews").where("orderId", "==", String(orderId)).limit(1)
      );
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
        status: "pending",
        published: false,
        publishedAt: null,
        createdAt: now,
        author,
        moderation: null,
      });
      tx.update(tokRef, { usedAt: now });

      return { reviewId: reviewRef.id, tok };
    });

    // ===== الموديريشن (OpenAI) =====
    let okToPublish = false;
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
    let modPayload: any = null;

    try {
      const mod = await moderateReview({
        text: isNonEmptyString(body.text) ? body.text : "",
        images: safeImages,
        stars: s,
      });

      modPayload = mod;
      okToPublish = !!mod?.ok;

      await db.collection("reviews").doc(txResult.reviewId).set(
        mod?.ok
          ? { moderation: { model: mod.model, score: mod.score, flags: mod.flags ?? [] } }
          : { moderation: { model: mod?.model || "openai", score: mod?.score ?? 0, flags: mod?.flags ?? ["blocked"] } },
        { merge: true }
      );
    } catch (e) {
      okToPublish = false;
      await db.collection("reviews").doc(txResult.reviewId).set(
        { moderation: { model: "none", score: 0, flags: ["moderation_error"] } },
        { merge: true }
      );
      console.error("moderation failed:", e);
    }

    // ===== قرار النشر =====
    if (okToPublish) {
      await db.collection("reviews").doc(txResult.reviewId).set(
        { status: "published", published: true, publishedAt: Date.now() },
        { merge: true }
      );
    } else {
      await db.collection("reviews").doc(txResult.reviewId).set(
        { status: "rejected", published: false, publishedAt: null },
        { merge: true }
      );
    }

    // ===== Denormalize: storeName / storeDomain =====
    try {
      const uid = txResult?.tok?.storeUid;
      if (uid) {
        const sDoc = await db.collection("stores").doc(uid).get();
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
        const s = (sDoc.exists ? sDoc.data() : {}) as any;

        const dom =
          s?.domain?.base ||
          s?.salla?.domain ||
          s?.zid?.domain ||
          null;

        let name =
          s?.merchant?.name ||
          s?.salla?.storeName ||
          s?.zid?.storeName ||
          s?.storeName ||
          null;

        if (!name && dom) {
          try { name = new URL(dom).hostname; } catch {}
        }

        await db.collection("reviews").doc(txResult.reviewId).set(
          { storeName: name ?? "غير محدد", storeDomain: dom ?? null },
          { merge: true }
        );
      }
    } catch (e) {
      console.warn("denorm storeName failed:", e);
    }

    return res.status(201).json({
      ok: true,
      id: txResult.reviewId,
      published: okToPublish,
      moderation: modPayload
        ? { model: modPayload.model, ok: !!modPayload.ok, score: modPayload.score, flags: modPayload.flags ?? [] }
        : null,
    });
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
