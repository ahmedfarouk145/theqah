// src/pages/api/orders/send-review.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";
import { verifyUser } from "@/utils/verifyUser";
import { createShortLink } from "@/server/short-links";
import { createReviewToken } from "@/server/review-tokens";
import { sendEmailDmail as sendEmail } from "@/server/messaging/email-dmail";
import { sendSms } from "@/server/messaging/send-sms";

type OrderDoc = {
  storeUid: string;
  storeName?: string;
  productId?: string | null;
  name?: string;
  phone?: string;
  email?: string;
  reviewSent?: boolean;
  reviewLink?: string;
  reviewTokenId?: string;
};

type Channel = "sms" | "email";
type ChannelResult = { channel: Channel; ok: boolean; error?: string };

type Ok = {
  ok: true;
  link: string;
  partial: boolean;
  channels: { sms?: boolean; email?: boolean };
  results: ChannelResult[];
  debug?: Record<string, unknown>;
};
type Err = {
  ok: false;
  message: string;
  results?: ChannelResult[];
  debug?: Record<string, unknown>;
};

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

// ✅ قالب بريد HTML مقاوم لعملاء البريد
function buildReviewEmailHTML(customerName: string, storeName: string, reviewUrl: string) {
  const pre = "قيّم تجربتك خلال دقيقة — اضغط الزر بالأسفل";
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>قيّم تجربتك</title>
</head>
<body style="margin:0;padding:0;background:#f6f7f9;">
  <!-- Preheader (مخفية) -->
  <div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0;">
    ${pre} ‏‏​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9;">
    <tr>
      <td align="center" style="padding:24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
          <tr>
            <td style="padding:20px 24px; text-align:right; font-family:Tahoma, Arial, sans-serif;">
              <img src="https://www.theqah.com.sa/logo.png" alt="ثقة" width="28" height="28" style="vertical-align:middle;border:none;margin-left:8px;">
              <span style="font-size:16px;font-weight:bold;color:#0f172a;">ثقة</span>
            </td>
          </tr>

          <tr>
            <td style="padding:0 24px 10px 24px; text-align:right; font-family:Tahoma, Arial, sans-serif;">
              <h1 style="margin:0 0 6px 0; font-size:20px; color:#0f172a;">مرحباً ${customerName}،</h1>
              <p style="margin:0; font-size:14px; color:#334155;">
                قيّم تجربتك من <strong>${storeName}</strong> وساهم في إسعاد يتيم!
              </p>
            </td>
          </tr>

          <tr>
            <td align="right" style="padding:18px 24px 6px 24px; font-family:Tahoma, Arial, sans-serif;">
              <!-- زر مقاوم لـ Outlook (VML) -->
              <!--[if mso]>
                <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${reviewUrl}" style="height:44px;v-text-anchor:middle;width:260px;" arcsize="12%" stroke="f" fillcolor="#16a34a">
                  <w:anchorlock/>
                  <center style="color:#ffffff;font-family:Tahoma,Arial,sans-serif;font-size:16px;">اضغط للتقييم الآن</center>
                </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-- -->
                <a href="${reviewUrl}" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:15px;">
                  اضغط للتقييم الآن
                </a>
              <!--<![endif]-->
            </td>
          </tr>

          <tr>
            <td style="padding:10px 24px 0 24px; text-align:right; font-family:Tahoma, Arial, sans-serif;">
              <p style="margin:0;font-size:12px;color:#64748b;">
                أو افتح هذا الرابط: <a href="${reviewUrl}" style="color:#0ea5e9;">${reviewUrl}</a>
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:24px; text-align:right; font-family:Tahoma, Arial, sans-serif;">
              <p style="margin:0;font-size:12px;color:#94a3b8;">شكراً لك — فريق ثقة</p>
            </td>
          </tr>
        </table>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin-top:12px;">
          <tr>
            <td style="text-align:center;font-family:Tahoma, Arial, sans-serif;color:#94a3b8;font-size:11px;">
              إذا لم تكن أنت المقصود بهذه الرسالة، يمكنك تجاهلها.
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<Ok | Err>) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  //eslint-disable-next-line @typescript-eslint/no-explicit-any
  const debugFlag = req.query.debug === "1" || (req.body && (req.body as any).debug === true);

  try {
    const { uid } = await verifyUser(req);

    const { id } = (req.body ?? {}) as { id?: string };
    if (!id) return res.status(400).json({ ok: false, message: "id required" });

    const db = dbAdmin();
    const docRef = db.collection("orders").doc(id);
    const snap = await docRef.get();
    if (!snap.exists) return res.status(404).json({ ok: false, message: "Order not found" });

    const order = snap.data() as OrderDoc;
    if (order.storeUid !== uid) return res.status(403).json({ ok: false, message: "Forbidden" });
    if (order.reviewSent) return res.status(409).json({ ok: false, message: "Already sent" });

    const token = await createReviewToken({
      orderId: id,
      storeUid: uid,
      productId: order.productId ?? "",
      name: order.name || "عميل",
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 يوم
    });

    const base = (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || "").replace(/\/+$/, "");
    if (!base) return res.status(500).json({ ok: false, message: "BASE_URL not configured" });

    const reviewUrl = `${base}/review/${token.id}`;

    // حاول اختصار الرابط؛ لو فشل استخدم الأصلي
    let publicUrl = reviewUrl;
    try {
      publicUrl = await createShortLink(reviewUrl);
    } catch {
      publicUrl = reviewUrl;
    }

    const storeName = order.storeName || "متجرك";
    const customerName = order.name || "عميلنا العزيز";

    const smsText = `مرحباً ${customerName}، قيّم تجربتك من ${storeName}: ${publicUrl} وساهم في إسعاد يتيم!`;
    const emailHtml = buildReviewEmailHTML(customerName, storeName, publicUrl);

    const haveSms = Boolean(order.phone);
    const haveEmail = Boolean(order.email);

    const canSms = Boolean(process.env.OURSMS_API_KEY);
    const canEmail =
      Boolean(process.env.DMAIL_SMTP_HOST) &&
      Boolean(process.env.DMAIL_SMTP_USER) &&
      Boolean(process.env.DMAIL_SMTP_PASS);

    const trySms = haveSms && canSms;
    const tryEmail = haveEmail && canEmail;

    const debugInfo: Record<string, unknown> = debugFlag
      ? {
          id,
          uid,
          haveSms,
          haveEmail,
          canSms,
          canEmail,
          envSeen: {
            OURSMS_API_KEY: !!process.env.OURSMS_API_KEY,
            OURSMS_BASE_URL: !!process.env.OURSMS_BASE_URL,
            DMAIL_SMTP_HOST: !!process.env.DMAIL_SMTP_HOST,
            DMAIL_SMTP_PORT: process.env.DMAIL_SMTP_PORT,
            DMAIL_SMTP_USER: !!process.env.DMAIL_SMTP_USER,
            DMAIL_FROM: process.env.DMAIL_FROM,
          },
          base,
          reviewUrl,
          publicUrl,
        }
      : {};

    if (!trySms && !tryEmail) {
      return res.status(400).json({
        ok: false,
        message: "No deliverable channels",
        results: [
          { channel: "sms", ok: false, error: !haveSms ? "no phone" : !canSms ? "provider not configured" : "skipped" },
          { channel: "email", ok: false, error: !haveEmail ? "no email" : !canEmail ? "provider not configured" : "skipped" },
        ],
        debug: debugInfo,
      });
    }

    async function attempt(channel: Channel, fn: () => Promise<{ ok: boolean }>): Promise<ChannelResult> {
      try {
        const r = await fn();
        return { channel, ok: !!r?.ok };
      } catch (e) {
        return { channel, ok: false, error: errMsg(e) };
      }
    }

    const attempts: Array<Promise<ChannelResult>> = [];
    if (trySms) attempts.push(attempt("sms", () => sendSms(String(order.phone), smsText)));
    if (tryEmail) attempts.push(attempt("email", () => sendEmail(String(order.email), "قيّم تجربتك معنا ✨", emailHtml)));

    const results = await Promise.all(attempts);
    const smsOk = results.find((r) => r.channel === "sms")?.ok || false;
    const emailOk = results.find((r) => r.channel === "email")?.ok || false;

    if (!(smsOk || emailOk)) {
      return res.status(502).json({ ok: false, message: "All channels failed", results, debug: debugInfo });
    }

    await docRef.update({
      reviewSent: true,
      reviewLink: publicUrl,
      reviewTokenId: token.id,
    });

    return res.status(200).json({
      ok: true,
      link: publicUrl,
      partial: Boolean(smsOk) !== Boolean(emailOk),
      channels: { sms: smsOk || undefined, email: emailOk || undefined },
      results,
      debug: debugInfo,
    });
  } catch (e: unknown) {
    const status = 401;
    return res.status(status).json({ ok: false, message: errMsg(e) });
  }
}
