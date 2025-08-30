// src/pages/api/admin/reviews/bulk.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";
import { verifyAdmin } from "@/utils/verifyAdmin";

const db = dbAdmin(); // Firebase Admin Firestore instance

type BulkAction = "publish" | "unpublish" | "delete" | "updateNotes";

interface BulkActionRequest {
  action: BulkAction;
  reviewIds: string[];
  moderatorNote?: string;
  reason?: string; // required for delete
}

interface BulkResponse {
  message: string;
  processed: number;
  failed: number;
  errors: Array<{ id?: string; error: string }>;
}

/** Basic sanitizer (for server-side). For production consider a robust sanitizer. */
function sanitizeText(s: string) {
  return s.replace(/<\s*script.*?>.*?<\s*\/\s*script\s*>/gi, "").trim();
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<BulkResponse | { message: string }>
) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ message: "Method not allowed" });
    }

    // Verify admin (throws on failure)
    const decoded = await verifyAdmin(req);

    // Parse and validate body
    const body = (req.body || {}) as BulkActionRequest;
    const { action, reviewIds, moderatorNote, reason } = body;

    if (!action || !["publish", "unpublish", "delete", "updateNotes"].includes(action)) {
      return res.status(400).json({ message: "Invalid action" });
    }

    if (!Array.isArray(reviewIds) || reviewIds.length === 0) {
      return res.status(400).json({ message: "reviewIds must be a non-empty array" });
    }

    // safety limits
    const MAX_ITEMS = 50;
    if (reviewIds.length > MAX_ITEMS) {
      return res
        .status(400)
        .json({ message: `Cannot process more than ${MAX_ITEMS} items in one request` });
    }

    if (action === "delete" && (!reason || typeof reason !== "string" || reason.trim().length === 0)) {
      return res.status(400).json({ message: "Delete action requires a non-empty reason" });
    }

    if (action === "updateNotes" && (!moderatorNote || typeof moderatorNote !== "string")) {
      return res.status(400).json({ message: "updateNotes action requires moderatorNote" });
    }

    // Normalize and validate IDs
    const ids = reviewIds
      .map((id) => (typeof id === "string" ? id.trim() : ""))
      .filter(Boolean);
    if (ids.length !== reviewIds.length) {
      return res.status(400).json({ message: "Some reviewIds are invalid" });
    }

    const errors: Array<{ id?: string; error: string }> = [];
    let processedCount = 0;

    // Firestore batch limit = 500 operations.
    const BATCH_OP_LIMIT = 500;
    const batches: FirebaseFirestore.WriteBatch[] = [];
    let currentBatch = db.batch();
    let currentOps = 0;

    // Pre-fetch documents in parallel (since number is small)
    const refs = ids.map((id) => db.collection("reviews").doc(id));
    const snaps = await Promise.all(refs.map((r) => r.get()));

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const snap = snaps[i];

      if (!snap.exists) {
        errors.push({ id, error: "Review not found" });
        continue;
      }

      const ref = refs[i];

      try {
        const now = new Date();
        switch (action) {
          case "publish":
            currentBatch.update(ref, { published: true, lastModified: now });
            currentOps++;
            break;
          case "unpublish":
            currentBatch.update(ref, { published: false, lastModified: now });
            currentOps++;
            break;
          case "updateNotes":
            currentBatch.update(ref, { moderatorNote: sanitizeText(moderatorNote!), lastModified: now });
            currentOps++;
            break;
          case "delete":
            currentBatch.delete(ref);
            currentOps++;
            break;
        }

        // If reached batch limit, push and start new one
        if (currentOps >= BATCH_OP_LIMIT) {
          batches.push(currentBatch);
          currentBatch = db.batch();
          currentOps = 0;
        }

        processedCount++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error during prepare";
        errors.push({ id, error: msg });
      }
    }

    // push last batch if has ops
    if (currentOps > 0) batches.push(currentBatch);

    // Commit batches sequentially
    for (const b of batches) {
      try {
        await b.commit();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "unknown";
        console.error("Batch commit failed:", err);
        errors.push({ error: `Batch commit failed: ${msg}` });
      }
    }

    // Write a single audit log summarizing the bulk action
    try {
      await db.collection("admin_audit_logs").add({
        action: `bulk-${action}`,
        adminUid: decoded.uid,
        reviewCountRequested: ids.length,
        reviewCountProcessed: processedCount - errors.filter((e) => !!e.id).length,
        reviewIds: ids,
        details:
          action === "delete"
            ? { reason: sanitizeText(reason || "") }
            : action === "updateNotes"
            ? { moderatorNote: sanitizeText(moderatorNote || "") }
            : {},
        errors,
        ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress || null,
        createdAt: new Date(),
      });
    } catch (e) {
      console.error("Failed to write admin audit log (bulk):", e);
      // Do not fail the request if audit log cannot be written
    }

    return res.status(200).json({
      message: "Bulk operation completed",
      processed: processedCount - errors.filter((e) => !!e.id).length,
      failed: errors.length,
      errors,
    });
  } catch (error) {
    console.error("Bulk reviews API error:", error);
    if (error instanceof Error) {
      if (error.message.startsWith("permission-denied")) {
        return res.status(403).json({ message: "Forbidden" });
      }
      if (error.message.startsWith("unauthenticated")) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      return res.status(400).json({ message: error.message || "Bad Request" });
    }
    return res.status(500).json({ message: "Internal Server Error" });
  }
}
