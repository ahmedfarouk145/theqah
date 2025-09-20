// src/pages/api/test-seed.ts
import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import { dbAdmin } from "@/lib/firebaseAdmin";
import { createShortLink } from "@/server/short-links";
import { buildInviteSMS } from "@/server/messaging/send-sms";
import { enqueueInviteJob } from "@/server/queue/outbox";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  const key = (req.headers["x-admin-secret"] || "").toString();
  if (!key || key !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "unauthorized" });
  }

  try {
    const { storeUid, toPhone, toEmail, storeName = "متجر تجريبي" } = (typeof req.body === "object" ? req.body : {}) as {
      storeUid?: string;
      toPhone?: string;
      toEmail?: string;
      storeName?: string;
    };

    if (!storeUid) return res.status(400).json({ error: "storeUid_required" });
    if (!toPhone && !toEmail) return res.status(400).json({ error: "at_least_one_of_toPhone_or_toEmail" });

    const db = dbAdmin();

    const tokenId = crypto.randomBytes(10).toString("hex");
    const base =
      (process.env.APP_BASE_URL ||
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.NEXT_PUBLIC_BASE_URL ||
        "").replace(/\/+$/, "");
    if (!base) throw new Error("BASE_URL not configured");

    const reviewUrl = `${base}/review/${tokenId}`;
    const publicUrl = await createShortLink(reviewUrl).catch(() => reviewUrl);

    await db.collection("review_tokens").doc(tokenId).set({
      id: tokenId,
      platform: "salla",
      orderId: `SEED-${Date.now()}`,
      storeUid,
      productId: "seed",
      productIds: ["seed"],
      createdAt: Date.now(),
      usedAt: null,
      publicUrl,
      targetUrl: reviewUrl,
      channel: "multi",
    });

    const inviteRef = await db.collection("review_invites").add({
      tokenId,
      orderId: `SEED-${Date.now()}`,
      platform: "salla",
      storeUid,
      productId: "seed",
      productIds: ["seed"],
      customer: {
        name: "Seed Buyer",
        email: toEmail || null,
        mobile: toPhone || null,
      },
      sentAt: Date.now(),
      deliveredAt: null,
      clicks: 0,
      publicUrl,
    });
    const inviteId = inviteRef.id;

    const channels: ("sms" | "email")[] = [];
    const payload: Record<string, unknown> = {};
    const smsText = buildInviteSMS(storeName, publicUrl);

    if (toPhone) {
      channels.push("sms");
      payload.smsText = smsText;
      payload.phone = toPhone;
    }
    if (toEmail) {
      channels.push("email");
      payload.emailHtml = `
        <div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.7">
          <p>مرحباً عميلنا،</p>
          <p>قيّم تجربتك من <strong>${storeName}</strong>.</p>
          <p><a href="${publicUrl}" style="background:#16a34a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">اضغط للتقييم الآن</a></p>
          <p style="color:#64748b">فريق ثقة</p>
        </div>`;
      payload.emailTo = toEmail;
      payload.emailSubject = "قيّم تجربتك معنا (اختبار)";
    }
//eslint-disable-next-line @typescript-eslint/no-explicit-any
    await enqueueInviteJob({ inviteId, storeUid, channels, payload: payload as any });

    return res.status(200).json({ ok: true, inviteId, tokenId, publicUrl, channels });
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    console.error("[test-seed] err", e?.message || e);
    return res.status(500).json({ error: "seed_failed", details: e?.message || "unknown" });
  }
}
