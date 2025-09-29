// src/pages/api/admin/email-logs.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const db = dbAdmin();
    
    // Get recent email attempts with detailed info
    const emailLogs = await db
      .collection("email_logs")
      .orderBy("timestamp", "desc")
      .limit(50)
      .get();

    const logs = emailLogs.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Get email stats
    const stats = await db.collection("email_stats").doc("summary").get();
    const statsData = stats.exists ? stats.data() : {};

    return res.status(200).json({
      ok: true,
      logs,
      stats: statsData,
      total: logs.length
    });

  } catch (error) {
    console.error("Email logs error:", error);
    return res.status(500).json({
      ok: false,
      error: "Failed to fetch email logs",
      details: String(error)
    });
  }
}
