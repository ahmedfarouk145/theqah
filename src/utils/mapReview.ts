// src/utils/mapReview.ts
export type VerifiedReason = 
  | 'subscription_date'      // Review created after subscription start
  | 'manual_verification'    // Manually verified by admin
  | 'auto_verified'          // Auto-verified by system rules
  | 'salla_native'           // Native Salla review (trusted)
  | null;                    // Not verified

export type ReviewOut = {
  id: string;
  name: string;
  comment: string;   // alias لـ text
  text: string;
  stars: number;
  storeName: string;
  storeDomain?: string | null;
  published: boolean;
  status?: string;
  createdAt?: string;
  publishedAt?: string;
  lastModified?: string;
  platform?: string;
  trustedBuyer?: boolean;
  verified?: boolean;
  verifiedReason?: VerifiedReason;
  images?: string[];
};
//eslint-disable-next-line @typescript-eslint/no-explicit-any
const isTS = (v: any): v is FirebaseFirestore.Timestamp => v && typeof v.toDate === "function";
//eslint-disable-next-line @typescript-eslint/no-explicit-any
const toMs = (v: any) => (
  isTS(v)
    ? v.toDate().getTime()
    : v instanceof Date
      ? v.getTime()
      : typeof v === "number"
        ? v
        : undefined
);
//eslint-disable-next-line @typescript-eslint/no-explicit-any
const toIso = (v: any) => {
  const ms = toMs(v);
  return typeof ms === "number" ? new Date(ms).toISOString() : undefined;
};

//eslint-disable-next-line @typescript-eslint/no-explicit-any
const isPublishedReview = (d: any) =>
  d?.published === true || d?.status === 'published' || d?.status === 'approved';

//eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapReview(id: string, d: any, storeName: string, storeDomain?: string | null): ReviewOut {
  const author = d?.author || {};
  const displayName = author.displayName || author.name || "عميل المتجر";
  const text = typeof d?.text === "string" ? d.text : "";

  return {
    id,
    name: displayName,
    comment: text,
    text,
    stars: Number(d?.stars) || 0,
    storeName,
    storeDomain: storeDomain ?? null,
    published: isPublishedReview(d),
    status: typeof d?.status === 'string' ? d.status : 'pending',
    createdAt: toIso(d?.createdAt),
    publishedAt: toIso(d?.publishedAt),
    lastModified: toIso(d?.lastModified),
    platform: d?.platform || "web",
    trustedBuyer: !!(d?.trustedBuyer ?? d?.verified),
    verified: !!d?.verified,
    verifiedReason: d?.verifiedReason || null,
    images: Array.isArray(d?.images) ? d.images.slice(0, 10) : [],
  };
}
