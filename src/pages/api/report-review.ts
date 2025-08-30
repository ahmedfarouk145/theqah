// src/pages/api/report-review.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";
import withCors from "@/server/withCors";

type Body = {
  reviewId?: string;
  reason?: string;
  name?: string;
  email?: string;
};

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ message: "Method Not Allowed" });

  const { reviewId, reason, name, email } = (req.body || {}) as Body;
  if (!reviewId || !reason) return res.status(400).json({ message: "reviewId and reason are required" });

  const db = dbAdmin();
  await db.collection("review_reports").add({
    reviewId: String(reviewId),
    reason: String(reason).slice(0, 2000),
    name: name ? String(name).slice(0, 200) : undefined,
    email: email ? String(email).slice(0, 200) : undefined,
    createdAt: Date.now(),
    resolved: false,
  });

  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ ok: true });
}

export default withCors(handler);
