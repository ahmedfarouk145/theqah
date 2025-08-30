// src/pages/api/support-ticket.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  const { name, email, message } = (req.body ?? {}) as {
    name?: unknown;
    email?: unknown;
    message?: unknown;
  };

  // تحققات بسيطة + تنظيف
  const n = typeof name === "string" ? name.trim() : "";
  const e = typeof email === "string" ? email.trim() : "";
  const m = typeof message === "string" ? message.trim() : "";

  if (!n || !e || !m) {
    return res.status(400).json({ message: "Missing fields" });
  }

  try {
    const db = dbAdmin(); // يهيّئ Firebase Admin داخليًا لو لسه

    await db.collection("support_tickets").add({
      name: n,
      email: e,
      message: m,
      createdAt: Date.now(), // بديل بسيط عن admin.firestore.Timestamp.now()
    });

    return res.status(200).json({ message: "Ticket submitted successfully" });
  } catch (error) {
    console.error("Error saving ticket:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
}
