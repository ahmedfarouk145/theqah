// src/server/review-tokens.ts
import { getDb } from "@/server/firebase-admin";

export type CreateTokenInput = {
  orderId: string;           // معرّف الطلب (من زد/سلة)
  storeUid: string;          // معرّف المتجر عندك
  productId: string;         // بديل منطقي لو غير متوفر من الحدث (مثلاً = orderId)
  name: string;              // اسم للعرض (مثلاً "تقييم طلب 123 - متجر ثقة")
  expiresAt: number;         // توقيت الانتهاء (Epoch ms)
  recipientPhone?: string;   // اختياري: رقم جوال بصيغة E.164
  recipientEmail?: string;   // اختياري: بريد العميل
  channel?: "sms" | "whatsapp" | "email" | "multi";
};

export type ReviewTokenDoc = CreateTokenInput & {
  id: string;
  createdAt: number;
  usedAt: number | null;
  voidedAt?: number | null;
  voidReason?: string | null;
};

export async function createReviewToken(input: CreateTokenInput): Promise<{ id: string }> {
  if (!input.orderId || !input.storeUid || !input.productId || !input.name || !input.expiresAt) {
    throw new Error("createReviewToken: missing required fields");
  }

  const db = getDb();
  const id = db.collection("review_tokens").doc().id;

  const doc: ReviewTokenDoc = {
    id,
    orderId: input.orderId,
    storeUid: input.storeUid,
    productId: input.productId,
    name: input.name,
    expiresAt: input.expiresAt,
    recipientPhone: input.recipientPhone,
    recipientEmail: input.recipientEmail,
    channel: input.channel ?? "multi",
    createdAt: Date.now(),
    usedAt: null,
    voidedAt: null,
    voidReason: null,
  };

  await db.collection("review_tokens").doc(id).set(doc);
  return { id };
}

export async function getReviewTokenById(id: string) {
  const db = getDb();
  const snap = await db.collection("review_tokens").doc(id).get();
  if (!snap.exists) return null;
  const d = snap.data() as ReviewTokenDoc;

  return {
    id: snap.id,
    storeUid: d.storeUid,
    productId: d.productId,
    usedAt: d.usedAt,
  };
}
