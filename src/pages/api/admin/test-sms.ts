// src/pages/api/admin/test-sms.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { sendSms } from "@/server/messaging/send-sms";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { to, message } = req.body;

  if (!to || !message) {
    return res.status(400).json({
      error: "Missing required fields",
      required: ["to", "message"]
    });
  }

  try {
    // Check environment configuration
    const hasApiKey = !!process.env.OURSMS_API_KEY;
    const hasSender = !!process.env.OURSMS_SENDER;
    
    if (!hasApiKey) {
      return res.status(500).json({
        error: "SMS not configured",
        details: "OURSMS_API_KEY environment variable is missing",
        hasApiKey: false,
        hasSender
      });
    }

    console.log(`[TEST-SMS] Attempting to send SMS to: ${to}`);
    
    const result = await sendSms(to, message);
    
    return res.status(200).json({
      ok: true,
      message: "SMS sent successfully",
      result,
      config: {
        hasApiKey,
        hasSender,
        service: "OurSMS",
        baseUrl: process.env.OURSMS_BASE_URL || "https://api.oursms.com"
      }
    });

  } catch (error) {
    console.error("[TEST-SMS] Failed to send SMS:", error);
    
    return res.status(500).json({
      ok: false,
      error: "Failed to send SMS",
      details: String(error),
      config: {
        hasApiKey: !!process.env.OURSMS_API_KEY,
        hasSender: !!process.env.OURSMS_SENDER,
        service: "OurSMS"
      }
    });
  }
}
