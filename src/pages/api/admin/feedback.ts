import type { NextApiRequest, NextApiResponse } from "next";
import { getDb } from "@/server/firebase-admin";

/**
 * Admin API to manage feedback
 * GET - List all feedback
 * PUT - Update feedback status
 * DELETE - Delete feedback
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  // Authentication
  const authHeader = req.headers.authorization;
  const ADMIN_SECRET = process.env.ADMIN_SECRET;

  if (!authHeader || authHeader !== `Bearer ${ADMIN_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const db = getDb();

  // GET - List feedback
  if (req.method === "GET") {
    try {
      const feedbackSnapshot = await db
        .collection("feedback")
        .orderBy("createdAt", "desc")
        .limit(100)
        .get();

      const feedbacks = feedbackSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
        resolvedAt: doc.data().resolvedAt?.toDate(),
      }));

      return res.status(200).json({ feedbacks });
    } catch (error) {
      console.error("Error fetching feedback:", error);
      return res.status(500).json({ error: "Failed to fetch feedback" });
    }
  }

  // PUT - Update feedback status
  if (req.method === "PUT") {
    try {
      const { feedbackId, status, notes } = req.body;

      if (!feedbackId || !status) {
        return res.status(400).json({ error: "feedbackId and status are required" });
      }

      const validStatuses = ["new", "reviewed", "resolved"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      const updateData: Record<string, unknown> = { status };
      if (status === "resolved") {
        updateData.resolvedAt = new Date();
      }
      if (notes) {
        updateData.notes = notes;
      }

      await db.collection("feedback").doc(feedbackId).update(updateData);

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error("Error updating feedback:", error);
      return res.status(500).json({ error: "Failed to update feedback" });
    }
  }

  // DELETE - Delete feedback
  if (req.method === "DELETE") {
    try {
      const { id } = req.query;

      if (!id || typeof id !== "string") {
        return res.status(400).json({ error: "Feedback ID is required" });
      }

      await db.collection("feedback").doc(id).delete();

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error("Error deleting feedback:", error);
      return res.status(500).json({ error: "Failed to delete feedback" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
