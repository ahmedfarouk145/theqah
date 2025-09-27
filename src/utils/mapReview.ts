// src/utils/mapReview.ts
export type ReviewOut = {
  id: string;
  storeUid?: string;
  storeName: string;
  text: string;
  stars: number;
  published: boolean;
  status?: string;
  trustedBuyer?: boolean;
  images?: string[];
  createdAt?: string;
  publishedAt?: string;
  lastModified?: string;
  moderatorNote?: string;
  productId?: string;
  productIds?: string[];
  orderId?: string;
  platform?: string;
  score?: number;
  model?: string;
};
//eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toIso(t: any): string | undefined {
  if (!t && t !== 0) return undefined;
  if (typeof t === 'number') return new Date(t).toISOString();
  // Firestore Timestamp
  const iso = t?.toDate?.()?.toISOString?.();
  if (iso) return iso;
  return typeof t === 'string' ? t : undefined;
}
//eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapReview(id: string, d: any, storeName = 'غير محدد'): ReviewOut {
  return {
    id,
    storeUid: d?.storeUid,
    storeName,
    text:
      d?.text ??
      d?.comment ??
      d?.content ??
      d?.message ??
      d?.body ??
      '',
    stars: d?.stars ?? d?.rating ?? 0,
    published: Boolean(d?.published ?? (d?.status === 'published')),
    status: d?.status,
    trustedBuyer: d?.trustedBuyer ?? false,
    images: Array.isArray(d?.images) ? d.images : undefined,
    createdAt: toIso(d?.createdAt),
    publishedAt: toIso(d?.publishedAt),
    lastModified: toIso(d?.lastModified),
    moderatorNote: d?.moderatorNote,
    productId: d?.productId,
    productIds: Array.isArray(d?.productIds) ? d.productIds : undefined,
    orderId: d?.orderId,
    platform: d?.platform,
    score: d?.score,
    model: d?.model,
  };
}
