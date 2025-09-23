export type Channel = "sms" | "email";

export type OutboxJobStatus = "pending" | "leased" | "ok" | "fail" | "dead";
export interface OutboxJob {
  jobId: string;
  inviteId: string;     // المرجع للدعوة (review_invites/{id})
  storeUid: string;
  channels: Channel[];  // ["sms","email"] أو واحدة منهم
  payload: Record<string, unknown>;
  status: OutboxJobStatus;
  attempts: number;
  lastError?: string | null;
  leasedBy?: string | null;
  leaseUntil?: FirebaseFirestore.Timestamp | null;
  nextRunAt?: FirebaseFirestore.Timestamp | null;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface PlanConfig {
  code: "TRIAL" | "P30" | "P60" | "P120";
  monthlyInvites: number;
}

export interface StoreUsage {
  plan: { code: PlanConfig["code"]; active: boolean };
  usage: { invitesUsed: number; monthAnchor?: string | null }; // optional: مرجع دورة سِلّة
}

export interface ReviewAuthor {
  show: boolean;              // موافقة على إظهار الاسم
  name: string | null;        // الاسم الخام (لا نُعيده في public)
  displayName: string;        // الاسم المعروض فقط
}

export interface ReviewDoc {
  id: string;
  storeUid: string;
  productId?: string | null;
  status: "pending" | "approved" | "rejected" | "published";
  publishedAt?: FirebaseFirestore.Timestamp | null;
  author: ReviewAuthor;
  // ... بقية حقول التقييم
}
