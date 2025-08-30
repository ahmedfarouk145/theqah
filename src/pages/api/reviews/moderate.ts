// src/pages/api/reviews/moderate.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";
import { checkReviewModeration } from "@/server/moderation/checkReview";
import { sendEmailDmail as sendEmail } from "@/server/messaging/email-dmail";
import { sendSms } from "@/server/messaging/send-sms";


type ReviewDoc = {
  id?: string; // قد لا يكون محفوظ داخل المستند
  orderId: string;
  text: string;
  stars: number;
  tokenId?: string | null;
  platform?: "salla" | "zid" | "manual";
  status: "pending" | "published" | "rejected";
  images?: string[];
  createdAt: number;
  moderatedAt?: number;
  moderationReasons?: string[];
  moderationCategory?: string;
  trustedBuyer?: boolean;
};

type InviteDoc = {
  tokenId?: string | null;
  customer?: {
    name?: string | null;
    mobile?: string | number | null;
    email?: string | null;
  };
};

type ModerationVerdict = {
  allowed: boolean;
  reasons?: string[];
  category?: string;
};

type PostSuccess =
  | { ok: true; published: true; trustedBuyer: boolean }
  | { ok: true; rejected: true; reasons?: string[]; category?: string }
  | { ok: true; skipped: true; status: ReviewDoc["status"] };

type GetItemResult =
  | { id: string; published: true; trustedBuyer: boolean }
  | { id: string; rejected: true; reasons?: string[]; category?: string };

type GetSuccess = { ok: true; processed: number; results: GetItemResult[] };

type ErrorResponse = { ok: false; error: string };

async function notifyRejectionViaToken(
  db: FirebaseFirestore.Firestore,
  tokenId?: string | null,
  reason?: string
): Promise<void> {
  if (!tokenId) return;

  // نجيب بيانات العميل من دعوة المراجعة
  const inviteSnap = await db
    .collection("review_invites")
    .where("tokenId", "==", tokenId)
    .limit(1)
    .get();
  if (inviteSnap.empty) return;

  const inv = inviteSnap.docs[0].data() as InviteDoc;

  const name = inv?.customer?.name || "عميلنا العزيز";
  const msg = `عذراً ${name}، تمت مراجعة تقييمك ولم يتم قبوله بسبب: ${
    reason || "مخالفة سياسة المحتوى"
  }. يمكنك إرسال تقييم جديد بصياغة مناسبة.`;
  const mobile = inv?.customer?.mobile
    ? String(inv.customer.mobile).replace(/\s+/g, "")
    : null;
  const email = inv?.customer?.email || null;

  const tasks: Array<Promise<unknown>> = [];
  if (mobile) {
    tasks.push(sendSms(mobile, msg));
  }
  if (email) {
    const html = `<div dir="rtl" style="font-family:Tahoma,Arial"><p>${msg}</p></div>`;
    tasks.push(sendEmail(email, "مراجعتك لم تُقبل", html));
  }
  await Promise.allSettled(tasks);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PostSuccess | GetSuccess | ErrorResponse>
) {
  // استخدام بسيط:
  // - POST {reviewId} لمراجعة عنصر واحد
  // - أو GET لمعالجة أول 20 مراجعة معلّقة (للاستخدام من كرون أو زر في الداشبورد)
  const db = dbAdmin();

  if (req.method === "POST") {
    const { reviewId } = (req.body || {}) as { reviewId?: string };
    if (!reviewId) return res.status(400).json({ ok: false, error: "reviewId_required" });

    const ref = db.collection("reviews").doc(String(reviewId));
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ ok: false, error: "not_found" });

    const review = snap.data() as ReviewDoc;
    if (review.status !== "pending") {
      return res.json({ ok: true, skipped: true, status: review.status });
    }

    const verdict: ModerationVerdict = await checkReviewModeration(review.text || "");
    if (verdict.allowed) {
      // لو فيه token صالح → اعتبره "مشتري موثّق"
      const trustedBuyer = Boolean(review.tokenId);
      await ref.set(
        {
          status: "published",
          trustedBuyer,
          moderatedAt: Date.now(),
          moderationReasons: verdict.reasons || [],
        },
        { merge: true }
      );
      return res.json({ ok: true, published: true, trustedBuyer });
    } else {
      await ref.set(
        {
          status: "rejected",
          moderatedAt: Date.now(),
          moderationReasons: verdict.reasons,
          moderationCategory: verdict.category,
        },
        { merge: true }
      );
      await notifyRejectionViaToken(db, review.tokenId, verdict.reasons?.[0]);
      return res.json({
        ok: true,
        rejected: true,
        reasons: verdict.reasons,
        category: verdict.category,
      });
    }
  }

  if (req.method === "GET") {
    const q = await db
      .collection("reviews")
      .where("status", "==", "pending")
      .orderBy("createdAt", "asc")
      .limit(20)
      .get();

    const results: GetItemResult[] = [];
    for (const doc of q.docs) {
      const r = doc.data() as ReviewDoc;
      const verdict: ModerationVerdict = await checkReviewModeration(r.text || "");
      if (verdict.allowed) {
        const trustedBuyer = Boolean(r.tokenId);
        await doc.ref.set(
          {
            status: "published",
            trustedBuyer,
            moderatedAt: Date.now(),
            moderationReasons: verdict.reasons || [],
          },
          { merge: true }
        );
        results.push({ id: doc.id, published: true, trustedBuyer });
      } else {
        await doc.ref.set(
          {
            status: "rejected",
            moderatedAt: Date.now(),
            moderationReasons: verdict.reasons,
            moderationCategory: verdict.category,
          },
          { merge: true }
        );
        await notifyRejectionViaToken(db, r.tokenId, verdict.reasons?.[0]);
        results.push({
          id: doc.id,
          rejected: true,
          reasons: verdict.reasons,
          category: verdict.category,
        });
      }
    }
    return res.json({ ok: true, processed: results.length, results });
  }

  return res.status(405).json({ ok: false, error: "method_not_allowed" });
}
