import type { NextApiRequest, NextApiResponse } from "next";
import { getDb } from "@/server/firebase-admin";
import nodemailer from "nodemailer";

/**
 * API endpoint to receive user feedback
 * POST /api/feedback
 * Body: { type, message, userEmail, userName, userAgent, url }
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { type, message, userEmail, userName, userAgent, url } = req.body;

    // Validation
    if (!type || !message) {
      return res.status(400).json({ error: "Type and message are required" });
    }

    if (message.length < 10 || message.length > 500) {
      return res.status(400).json({ error: "Message must be between 10-500 characters" });
    }

    const validTypes = ["bug", "feature", "question", "other"];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: "Invalid feedback type" });
    }

    const db = getDb();
    const timestamp = new Date();

    // Save to Firestore
    const feedbackRef = await db.collection("feedback").add({
      type,
      message,
      userEmail: userEmail || null,
      userName: userName || null,
      userAgent: userAgent || null,
      url: url || null,
      status: "new", // new, reviewed, resolved
      createdAt: timestamp,
      resolvedAt: null,
      notes: null,
    });

    // Send email notification
    try {
      await sendFeedbackEmail({
        id: feedbackRef.id,
        type,
        message,
        userEmail,
        userName,
        url,
        timestamp,
      });
    } catch (emailError) {
      console.error("Failed to send feedback email:", emailError);
      // Don't fail the request if email fails
    }

    // Track in metrics (optional)
    await db.collection("metrics").add({
      timestamp,
      type: "feedback",
      severity: "info",
      metadata: {
        feedbackType: type,
        feedbackId: feedbackRef.id,
        hasUserInfo: !!userEmail,
      },
    });

    return res.status(200).json({
      success: true,
      feedbackId: feedbackRef.id,
    });
  } catch (error) {
    console.error("Error processing feedback:", error);
    return res.status(500).json({
      error: "Failed to submit feedback",
    });
  }
}

// Send email notification
async function sendFeedbackEmail(data: {
  id: string;
  type: string;
  message: string;
  userEmail?: string;
  userName?: string;
  url?: string;
  timestamp: Date;
}) {
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "farwqahmd118@gmail.com";
  const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;

  if (!SENDGRID_API_KEY) {
    console.warn("SendGrid API key not configured, skipping email");
    return;
  }

  const typeEmoji: Record<string, string> = {
    bug: "🐛",
    feature: "💡",
    question: "❓",
    other: "💬",
  };

  const typeLabel: Record<string, string> = {
    bug: "Bug Report",
    feature: "Feature Request",
    question: "Question",
    other: "Other",
  };

  const transporter = nodemailer.createTransport({
    host: "smtp.sendgrid.net",
    port: 587,
    auth: {
      user: "apikey",
      pass: SENDGRID_API_KEY,
    },
  });

  const emailHtml = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; background: #f9fafb; padding: 20px; }
        .header { background: linear-gradient(135deg, #2563eb, #1d4ed8); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: white; padding: 30px; border-radius: 0 0 8px 8px; }
        .badge { display: inline-block; padding: 6px 12px; border-radius: 20px; font-size: 14px; font-weight: bold; margin-bottom: 20px; }
        .badge-bug { background: #fee2e2; color: #991b1b; }
        .badge-feature { background: #dbeafe; color: #1e40af; }
        .badge-question { background: #ede9fe; color: #5b21b6; }
        .badge-other { background: #f3f4f6; color: #374151; }
        .message-box { background: #f9fafb; padding: 20px; border-left: 4px solid #2563eb; border-radius: 4px; margin: 20px 0; }
        .info-grid { display: grid; gap: 10px; margin-top: 20px; }
        .info-item { display: flex; justify-content: space-between; padding: 10px; background: #f9fafb; border-radius: 4px; }
        .info-label { font-weight: bold; color: #6b7280; }
        .footer { text-align: center; padding: 20px; color: #9ca3af; font-size: 12px; }
        .button { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${typeEmoji[data.type]} ملاحظات جديدة من TheQah</h1>
        </div>
        <div class="content">
          <div class="badge badge-${data.type}">
            ${typeLabel[data.type]}
          </div>
          
          <div class="message-box">
            <p style="margin: 0; white-space: pre-wrap;">${data.message}</p>
          </div>

          <div class="info-grid">
            ${data.userName ? `
              <div class="info-item">
                <span class="info-label">المستخدم:</span>
                <span>${data.userName}</span>
              </div>
            ` : ""}
            ${data.userEmail ? `
              <div class="info-item">
                <span class="info-label">البريد الإلكتروني:</span>
                <span>${data.userEmail}</span>
              </div>
            ` : ""}
            ${data.url ? `
              <div class="info-item">
                <span class="info-label">الصفحة:</span>
                <span style="font-size: 12px;">${data.url}</span>
              </div>
            ` : ""}
            <div class="info-item">
              <span class="info-label">التاريخ:</span>
              <span>${data.timestamp.toLocaleString("ar-SA")}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Feedback ID:</span>
              <span style="font-family: monospace; font-size: 12px;">${data.id}</span>
            </div>
          </div>

          <div style="text-align: center;">
            <a href="https://console.firebase.google.com/project/theqah-d3ee0/firestore/databases/-default-/data/~2Ffeedback~2F${data.id}" 
               class="button">
              عرض في Firebase Console
            </a>
          </div>
        </div>
        <div class="footer">
          <p>TheQah - Customer Reviews & Loyalty Platform</p>
          <p>هذه رسالة تلقائية، يرجى عدم الرد عليها مباشرة.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  await transporter.sendMail({
    from: process.env.SENDGRID_FROM_EMAIL || "noreply@theqah.com",
    to: ADMIN_EMAIL,
    subject: `${typeEmoji[data.type]} [TheQah] ${typeLabel[data.type]}: ${data.message.substring(0, 50)}...`,
    html: emailHtml,
  });
}
