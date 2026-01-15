// src/server/triggers/review-created.ts
import { dbAdmin } from "@/lib/firebaseAdmin";
import { enqueueOutboxJob } from "@/server/queue/outbox";

/**
 * Trigger to be called when a review is created.
 * If status is 'pending', enqueue a notification job for merchant approval.
 */
export async function onReviewCreated(reviewId: string, reviewData: Record<string, unknown>) {
  const status = reviewData.status;
  const storeUid = reviewData.storeUid;

  // Only notify for pending reviews with a storeUid
  if (status !== "pending" || !storeUid) {
    return;
  }

  const db = dbAdmin();
  
  try {
    // Get store info for email/notification
    const storeSnap = await db.collection("stores").doc(String(storeUid)).get();
    const storeData = storeSnap.exists ? storeSnap.data() : null;
    
    const merchantEmail = storeData?.email || storeData?.merchantEmail;
    const storeName = storeData?.storeName || "متجرك";

    // Create a notification job in outbox_jobs
    const jobId = await enqueueOutboxJob({
      inviteId: reviewId, // Using reviewId as the reference
      storeUid: String(storeUid),
      channels: ["email"], // Email notification only for now
      payload: {
        type: "merchant_review_approval_needed",
        reviewId,
        storeUid: String(storeUid),
        storeName,
        merchantEmail,
        subject: "تقييم جديد يتطلب اعتمادك",
        emailHtml: `
          <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">تقييم جديد يتطلب موافقتك</h2>
            <p>مرحباً ${storeName}،</p>
            <p>لديك تقييم جديد يتطلب موافقتك قبل نشره في متجرك.</p>
            <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p><strong>النجوم:</strong> ${reviewData.stars || "غير محدد"}/5</p>
              <p><strong>النص:</strong> ${reviewData.text || "لا يوجد نص"}</p>
            </div>
            <p>يرجى مراجعة التقييم من لوحة التحكم واعتماده أو رفضه.</p>
            <a href="${process.env.NEXT_PUBLIC_BASE_URL || process.env.APP_BASE_URL || "https://theqah.com"}/dashboard" 
               style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0;">
              انتقل إلى لوحة التحكم
            </a>
          </div>
        `,
      },
    });

    console.log(`[onReviewCreated] Enqueued approval notification job: ${jobId} for review ${reviewId}`);
  } catch (error) {
    console.error(`[onReviewCreated] Failed to enqueue notification for review ${reviewId}:`, error);
    // Don't throw - we don't want to fail the review creation
  }
}
