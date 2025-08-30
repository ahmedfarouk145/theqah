// src/pages/api/reviews/[id]/reply.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";

// TODO: استبدلها بتحقق صلاحيات فعلي (مالك المتجر/طاقمه)
async function requireStoreOwner(req: NextApiRequest): Promise<{ storeId: string; userId: string; }> {
  const storeId = (req.headers["x-store-id"] as string) || "";
  const userId = (req.headers["x-user-id"] as string) || "";
  if (!storeId || !userId) throw new Error("unauthorized");
  return { storeId, userId };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = dbAdmin();
  const { id } = req.query as { id: string };

  if (req.method === "POST") {
    try {
      const { storeId, userId } = await requireStoreOwner(req);
      const { text } = (req.body || {}) as { text?: string };
      const t = String(text || "").trim();
      if (!t) return res.status(400).json({ ok:false, error:"text_required" });

      // تأكد المراجعة موجودة ومن نفس المتجر (يمكن إضافة check storeId على وثيقة review)
      const reviewRef = db.collection("reviews").doc(id);
      const reviewSnap = await reviewRef.get();
      if (!reviewSnap.exists) return res.status(404).json({ ok:false, error:"review_not_found" });

      const replyRef = reviewRef.collection("replies").doc();
      await replyRef.set({
        id: replyRef.id,
        reviewId: id,
        storeId,
        userId,
        text: t.slice(0, 2000),
        createdAt: Date.now(),
      });

      // last_replied_at للمراجعة
      await reviewRef.set({ lastRepliedAt: Date.now() }, { merge: true });

      return res.json({ ok:true, id: replyRef.id });
    } catch (e) {
      const msg = String(e || "");
      const code = msg.includes("unauthorized") ? 401 : 500;
      return res.status(code).json({ ok:false, error: msg.includes("unauthorized") ? "unauthorized":"server_error" });
    }
  }

  if (req.method === "GET") {
    // ترجع سلسلة الردود
    const replies = await db.collection("reviews").doc(id).collection("replies")
      .orderBy("createdAt","asc").get();
    return res.json({
      ok:true,
      items: replies.docs.map(d => d.data()),
    });
  }

  return res.status(405).json({ ok:false, error:"method_not_allowed" });
}
