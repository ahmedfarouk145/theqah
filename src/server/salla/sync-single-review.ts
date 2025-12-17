// src/server/salla/sync-single-review.ts
import { dbAdmin } from "@/lib/firebaseAdmin";
import { getOwnerAccessToken } from "@/lib/sallaClient";

/**
 * Sync a single review from Salla by ID
 * Used for real-time webhook processing
 */
export async function syncSingleReview(
  storeUid: string,
  reviewId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const db = dbAdmin();
    
    // Get store data
    const storeSnap = await db.collection("stores").doc(storeUid).get();
    if (!storeSnap.exists) {
      return { ok: false, error: "Store not found" };
    }

    const storeData = storeSnap.data();
    const merchantId = storeData?.salla?.merchantId || storeUid.replace("salla:", "");
    const subscription = storeData?.subscription || {};
    const subscriptionStart = subscription.startedAt || 0;

    // Get access token
    const token = await getOwnerAccessToken(db, storeUid);
    if (!token) {
      return { ok: false, error: "Failed to get access token" };
    }

    // Fetch specific review from Salla
    const url = `https://api.salla.dev/admin/v2/reviews/${reviewId}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Salla Review API] Error ${response.status}:`, errorText);
      return { ok: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    const sallaReview = data?.data;

    if (!sallaReview) {
      return { ok: false, error: "Review not found in response" };
    }

    // ✅ Check if already exists using query (can add to index)
    const docId = `salla_${merchantId}_${sallaReview.id}`;
    const existingQuery = await db.collection("reviews")
      .where("storeUid", "==", storeUid)
      .where("sallaReviewId", "==", String(sallaReview.id))
      .limit(1)
      .get();

    if (!existingQuery.empty) {
      console.log(`[Sync] Review ${docId} already exists, skipping`);
      return { ok: true };
    }

    // Check verification status
    const reviewDate = sallaReview.created_at 
      ? new Date(sallaReview.created_at).getTime() 
      : 0;
    const isVerified = subscriptionStart > 0 && reviewDate >= subscriptionStart;

    // Save review
    const reviewDoc = {
      reviewId: docId,
      storeUid,
      sallaReviewId: String(sallaReview.id),
      source: "salla_native",
      
      productId: String(sallaReview.product_id || ""),
      productName: sallaReview.product?.name || "",
      
      stars: Number(sallaReview.rating || 0),
      text: sallaReview.comment || "",
      
      author: {
        displayName: sallaReview.customer?.name || "عميل سلة",
        email: sallaReview.customer?.email || "",
        mobile: sallaReview.customer?.mobile || "",
      },
      
      status: sallaReview.status || "approved",
      trustedBuyer: false,
      verified: isVerified, // ✨ معتمد إذا جاء بعد الاشتراك
      publishedAt: reviewDate || Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      
      sallaData: {
        isVerified: sallaReview.is_verified || false,
        helpful: sallaReview.helpful || 0,
        notHelpful: sallaReview.not_helpful || 0,
      },
    };

    await db.collection("reviews").doc(docId).set(reviewDoc);

    console.log(`[Sync] ✅ Review ${docId} synced successfully (verified: ${isVerified})`);
    return { ok: true };

  } catch (error: unknown) {
    console.error("[Sync Single Review Error]:", error);
    return { ok: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
