// src/pages/api/zid/webhook.ts
import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import { dbAdmin } from "@/lib/firebaseAdmin";
import { createShortLink } from "@/server/short-links"; // ✅ صححنا المسار
import {sendEmailDmail  as sendEmail } from "@/server/messaging/email-dmail"; // ✅ صححنا المسار
import { sendSms } from "@/server/messaging/send-sms"; // ✅ شيلنا واتساب

export const config = { api: { bodyParser: false } };

type UnknownRecord = Record<string, unknown>;
interface ZidCustomer { name?: string; email?: string; mobile?: string }
interface ZidItem { product_id?: string|number; id?: string|number }
interface ZidOrder {
  id?: string|number; number?: string|number; status?: string;
  customer?: ZidCustomer;
  store?: { id?: string|number; name?: string } | null;
  items?: ZidItem[];
}
interface ZidWebhookBody { event?: string; data?: ZidOrder | UnknownRecord; }

const DONE = new Set(["delivered", "completed", "complete"]);
const CANCEL = new Set(["canceled", "cancelled", "refunded", "returned"]);
const lc = (x: unknown) => String(x ?? "").toLowerCase();

function readRawBody(req: NextApiRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function validSignature(raw: Buffer, secret: string, given?: string) {
  if (!secret) return true;
  if (!given) return false;
  const mac = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(given));
}

// ✅ سمّيناه storeUid لتوحيد التسمية مع باقي الكود
function pickStoreUidFromZid(o: UnknownRecord): string | undefined {
  const store = o["store"] as UnknownRecord | undefined;
  const sid = store?.["id"];
  return sid !== undefined ? String(sid) : undefined;
}
function pickProductIdsFromZid(o: UnknownRecord): string[] {
  const items = (o["items"] as UnknownRecord[] | undefined) ?? [];
  const ids: string[] = [];
  for (const it of items) {
    const pid = (it?.["product_id"] ?? it?.["id"]);
    if (pid !== undefined) ids.push(String(pid));
  }
  return Array.from(new Set(ids)).slice(0, 20);
}

// ===== Extra guards =====
function pickName(obj: unknown): string | undefined {
  if (obj && typeof obj === "object" && "name" in obj) {
    const n = (obj as { name?: unknown }).name;
    return typeof n === "string" ? n : undefined;
  }
  return undefined;
}
function getStoreName(ev: UnknownRecord): string | undefined {
  return pickName(ev["store"]);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const raw = await readRawBody(req);
  const db = dbAdmin();

  // توقيع اختياري
  const secret = process.env.ZID_WEBHOOK_SECRET ?? "";
  const sig = (req.headers["x-zid-signature"] as string) ?? "";
  if (!validSignature(raw, secret, sig)) return res.status(401).json({ error: "invalid_signature" });

  const body = JSON.parse(raw.toString("utf8") || "{}") as ZidWebhookBody;
  const event = String(body.event || "");
  const data = (body.data ?? {}) as ZidOrder;

  // Idempotency
  const idemKey = crypto.createHash("sha256").update((sig || "") + "|").update(raw).digest("hex");
  const idemRef = db.collection("webhooks_zid").doc(idemKey);
  if ((await idemRef.get()).exists) return res.status(200).json({ ok: true, deduped: true });
  await idemRef.set({ at: Date.now(), event });

  const orderId = String(data.id ?? "");
  const status = lc(data.status ?? "");

  // Snapshot + storeUid
  const eventRaw = (body.data ?? {}) as UnknownRecord;
  const storeUid = pickStoreUidFromZid(eventRaw) || null;

  await db.collection("orders").doc(orderId).set({
    id: orderId,
    number: data.number ?? null,
    status,
    customer: {
      name: data.customer?.name ?? null,
      email: data.customer?.email ?? null,
      mobile: data.customer?.mobile ?? null,
    },
    storeUid,            // ✅ توحيد التسمية
    platform: "zid",
    updatedAt: Date.now(),
  }, { merge: true });

  // إرسال دعوة عند الإنجاز — مع تمرير storeUid/productIds
  if (DONE.has(status)) {
    const invitesSnap = await db.collection("review_invites").where("orderId", "==", orderId).limit(1).get();
    if (invitesSnap.empty) {
      const productIds = pickProductIdsFromZid(eventRaw);
      const primaryProductId = productIds[0] || null;

      const tokenId = crypto.randomBytes(10).toString("hex");
      const base =
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.APP_BASE_URL ||
        process.env.NEXT_PUBLIC_BASE_URL ||
        "";
      if (!base) throw new Error("BASE_URL not configured");

      const reviewUrl = `${base}/review/${tokenId}`;
      const publicUrl = await createShortLink(reviewUrl); // ✅ الدالة ترجع رابط /r/<id> جاهز

      await db.collection("review_tokens").doc(tokenId).set({
        id: tokenId,
        platform: "zid",
        orderId,
        storeUid,                 // ✅
        productIds,
        productId: primaryProductId,
        createdAt: Date.now(),
        usedAt: null,
        publicUrl,
        targetUrl: reviewUrl,
        channel: "multi",
      });

      const buyer = data.customer ?? {};
      await db.collection("review_invites").add({
        tokenId, orderId, platform: "zid",
        storeUid,                 // ✅
        productIds,
        productId: primaryProductId,
        customer: { name: buyer.name ?? null, email: buyer.email ?? null, mobile: buyer.mobile ?? null },
        sentAt: Date.now(), deliveredAt: null, clicks: 0,
        publicUrl,
      });

      const name = buyer.name || "عميلنا العزيز";
      const storeName = getStoreName(eventRaw) ?? "متجرك";
      const smsText = `مرحباً ${name}، قيم تجربتك من ${storeName}:: ${publicUrl} وساهم في إسعاد يتيم!`;
      const emailHtml = `
        <div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.7">
          <p>مرحباً ${name}،</p>
          <p>قيم تجربتك من <strong>${storeName}</strong> وساهم في إسعاد يتيم!</p>
          <p><a href="${publicUrl}" style="background:#16a34a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">اضغط للتقييم الآن</a></p>
          <p style="color:#64748b">شكراً لك — فريق ثقة</p>
        </div>
      `;

      const tasks: Array<Promise<unknown>> = [];
      if (buyer.mobile) {
        const mobile = String(buyer.mobile).replace(/\s+/g, "");
        tasks.push(sendSms(mobile, smsText)); // ✅ واتساب اتشال
      }
      if (buyer.email) {
        tasks.push(sendEmail(buyer.email, "قيّم تجربتك معنا ✨", emailHtml));
      }
      await Promise.allSettled(tasks);
    }
  }

  if (CANCEL.has(status)) {
    const q = await db.collection("review_tokens").where("orderId","==",orderId).get();
    const batch = db.batch();
    q.docs.forEach(d => batch.update(d.ref, { voidedAt: Date.now(), voidReason: `status_${status}` }));
    await batch.commit();
  }

  return res.status(200).json({ ok: true });
}
