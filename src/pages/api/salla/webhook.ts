// src/pages/api/salla/webhook.ts
import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import { dbAdmin } from "@/lib/firebaseAdmin";
import { createShortLink } from "@/server/short-links";
import { sendEmailDmail as sendEmail } from "@/server/messaging/email-dmail";
import { sendSms } from "@/server/messaging/send-sms";

export const config = { api: { bodyParser: false } };

// ========== Types ==========
type UnknownRecord = Record<string, unknown>;

interface SallaCustomer {
  name?: string;
  email?: string;
  mobile?: string;
}

interface SallaItem {
  id?: string | number;
  product?: { id?: string | number } | null;
  product_id?: string | number;
}

interface SallaOrder {
  id?: string | number;
  order_id?: string | number;
  number?: string | number;
  status?: string;
  order_status?: string;
  new_status?: string;
  shipment_status?: string;
  customer?: SallaCustomer;
  items?: SallaItem[];
  store?: { id?: string | number; name?: string } | null;
  merchant?: { id?: string | number; name?: string } | null;
}

interface SallaWebhookBody {
  event: string;
  data?: SallaOrder | UnknownRecord;
}

type Firestore = FirebaseFirestore.Firestore;

// ========== Helpers ==========
function readRawBody(req: NextApiRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function timingSafeEq(a: string, b: string) {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  if (A.length !== B.length) return false;
  return crypto.timingSafeEqual(A, B);
}

function normalizeSig(given: string) {
  // بعض الأنظمة ترسل "sha256=....."
  return given.startsWith("sha256=") ? given.slice(7) : given;
}

/**
 * يدعم التوقيع بصيغة hex أو base64 ويمنع أخطاء اختلاف الأطوال
 */
function validSignature(raw: Buffer, secret: string, given?: string) {
  // لو عايز تجبر وجود السر، غيّر الشرط التالي إلى: if (!secret) return false;
  if (!secret) return true;
  if (!given) return false;

  const sig = normalizeSig(given);

  const h = crypto.createHmac("sha256", secret).update(raw);
  const expectedHex = h.digest("hex");
  const expectedB64 = Buffer.from(expectedHex, "hex").toString("base64");

  return timingSafeEq(sig, expectedHex) || timingSafeEq(sig, expectedB64);
}

const DONE = new Set(["paid", "fulfilled", "delivered", "completed", "complete"]);
const CANCEL = new Set(["canceled", "cancelled", "refunded", "returned"]);
const lc = (x: unknown) => String(x ?? "").toLowerCase();
const keyOf = (event: string, orderId?: string, status?: string) =>
  `salla:${lc(event)}:${orderId ?? "none"}:${status ?? ""}`;

function pickName(obj: unknown): string | undefined {
  if (obj && typeof obj === "object" && "name" in obj) {
    const n = (obj as { name?: unknown }).name;
    return typeof n === "string" ? n : undefined;
  }
  return undefined;
}

function getStoreOrMerchantName(ev: UnknownRecord): string | undefined {
  const store = ev["store"];
  const merchant = ev["merchant"];
  return pickName(store) ?? pickName(merchant);
}

// استخراج storeUid من الحدث (من store أو merchant)
function pickStoreUidFromSalla(o: UnknownRecord): string | undefined {
  const store = o["store"] as UnknownRecord | undefined;
  const merchant = o["merchant"] as UnknownRecord | undefined;
  const sid = store?.["id"] ?? merchant?.["id"];
  return sid !== undefined ? String(sid) : undefined;
}

// استخراج productIds من عناصر الطلب
function extractProductIds(items?: SallaItem[]): string[] {
  if (!Array.isArray(items)) return [];
  const ids = new Set<string>();
  for (const it of items) {
    const raw = it?.product_id ?? it?.product?.id ?? it?.id;
    if (raw !== undefined && raw !== null) ids.add(String(raw));
  }
  return [...ids];
}

// ====== Snapshots/Invites ======
async function upsertOrderSnapshot(db: Firestore, order: SallaOrder, storeUid?: string | null) {
  const orderId = String(order.id ?? order.order_id ?? "");
  if (!orderId) return;
  await db.collection("orders").doc(orderId).set(
    {
      id: orderId,
      number: order.number ?? null,
      status: lc(order.status ?? order.order_status ?? order.new_status ?? order.shipment_status ?? ""),
      customer: {
        name: order.customer?.name ?? null,
        email: order.customer?.email ?? null,
        mobile: order.customer?.mobile ?? null,
      },
      storeUid: storeUid ?? null, // ✅ توحيد التسمية
      platform: "salla",
      updatedAt: Date.now(),
    },
    { merge: true }
  );
}

async function ensureInviteForOrder(db: Firestore, order: SallaOrder, eventRaw: UnknownRecord) {
  const orderId = String(order.id ?? order.order_id ?? "");
  if (!orderId) return;

  // لا تُكرر الدعوة لنفس الطلب
  const invitesSnap = await db.collection("review_invites").where("orderId", "==", orderId).limit(1).get();
  if (!invitesSnap.empty) return;

  // حاول قراءة storeUid من الحدث، وإن ما وُجد نقرأه من orders/{orderId}
  let storeUid: string | null = pickStoreUidFromSalla(eventRaw) || null;
  if (!storeUid) {
    try {
      const o = await db.collection("orders").doc(orderId).get();
      storeUid = (o.data()?.storeUid as string) || null;
    } catch {
      storeUid = null;
    }
  }

  // اجمع productIds
  const productIds = extractProductIds((order as SallaOrder).items);
  if (productIds.length === 0) {
    const rawItems = (eventRaw["items"] as SallaItem[] | undefined) ?? [];
    productIds.push(...extractProductIds(rawItems));
  }
  const mainProductId = productIds[0] || orderId;

  // توليد رمز + روابط
  const tokenId = crypto.randomBytes(10).toString("hex");
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    "";
  if (!base) throw new Error("BASE_URL not configured");

  const reviewUrl = `${base}/review/${tokenId}`;
  const publicUrl = await createShortLink(reviewUrl); // ✅ الدالة عندك بترجع رابط /r/<id> كامل

  // تخزين الـ token
  await db.collection("review_tokens").doc(tokenId).set({
    id: tokenId,
    platform: "salla",
    orderId,
    storeUid, // ✅ توحيد التسمية
    productId: mainProductId,
    productIds,
    createdAt: Date.now(),
    usedAt: null,
    publicUrl,
    targetUrl: reviewUrl,
    channel: "multi",
  });

  // تخزين الدعوة
  const buyer = order.customer ?? {};
  await db.collection("review_invites").add({
    tokenId,
    orderId,
    platform: "salla",
    storeUid, // ✅ توحيد التسمية
    productId: mainProductId,
    productIds,
    customer: {
      name: buyer.name ?? null,
      email: buyer.email ?? null,
      mobile: buyer.mobile ?? null,
    },
    sentAt: Date.now(),
    deliveredAt: null,
    clicks: 0,
    publicUrl,
  });

  // إرسال SMS / Email فقط
  const name = buyer.name || "عميلنا العزيز";
  const storeName = getStoreOrMerchantName(eventRaw) ?? "متجرك";
  const smsText = `مرحباً ${name}، قيم تجربتك من ${storeName}:: ${publicUrl} وساهم في إسعاد يتيم!`;

  const tasks: Array<Promise<unknown>> = [];
  if (buyer.mobile) {
    const mobile = String(buyer.mobile).replace(/\s+/g, "");
    tasks.push(sendSms(mobile, smsText));
  }
  if (buyer.email) {
    const emailHtml = `
      <div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.7">
        <p>مرحباً ${name}،</p>
        <p>قيم تجربتك من <strong>${storeName}</strong> وساهم في إسعاد يتيم!</p>
        <p><a href="${publicUrl}" style="background:#16a34a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">اضغط للتقييم الآن</a></p>
        <p style="color:#64748b">شكراً لك — فريق ثقة</p>
      </div>`;
    tasks.push(sendEmail(buyer.email, "قيّم تجربتك معنا ✨", emailHtml));
  }
  await Promise.allSettled(tasks);
}

async function voidInvitesForOrder(db: Firestore, orderId: string, reason: string) {
  if (!orderId) return;
  const q = await db.collection("review_tokens").where("orderId", "==", orderId).get();
  const batch = db.batch();
  q.docs.forEach((d) => batch.update(d.ref, { voidedAt: Date.now(), voidReason: reason }));
  await batch.commit();
}

// ====== Handler ======
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  // 1) raw body + signature
  const raw = await readRawBody(req);
  const secret = process.env.SALLA_WEBHOOK_SECRET ?? "";
  const sig = (req.headers["x-salla-signature"] as string) ?? "";

  if (!validSignature(raw, secret, sig)) {
    return res.status(401).json({ error: "invalid_signature" });
  }

  // 2) parse body (آمن بعد التحقق)
  let body: SallaWebhookBody;
  try {
    body = JSON.parse(raw.toString("utf8") || "{}") as SallaWebhookBody;
  } catch {
    return res.status(400).json({ error: "bad_json" });
  }

  const event = String(body.event || "");
  const data = (body.data ?? {}) as SallaOrder;
  const orderId = String(data.id ?? data.order_id ?? "");
  const status = lc(
    data.status ?? data.order_status ?? data.new_status ?? data.shipment_status ?? ""
  );

  const db = dbAdmin();

  // 3) Idempotency أقوى: استخدم signature + event + orderId + raw
  const idemKey = crypto
    .createHash("sha256")
    .update((sig || "") + "|")
    .update(event + "|" + orderId + "|")
    .update(raw)
    .digest("hex");

  const idemRef = db.collection("webhooks_salla").doc(idemKey);
  if ((await idemRef.get()).exists) {
    return res.status(200).json({ ok: true, deduped: true });
  }
  await idemRef.set({ at: Date.now(), event, orderId, status });

  // 4) Snapshot
  const eventRaw = (body.data ?? {}) as UnknownRecord;
  const storeUidFromEvent = pickStoreUidFromSalla(eventRaw) || null;
  await upsertOrderSnapshot(db, data, storeUidFromEvent);

  // 5) Process by status
  if (event.includes("orders.status.update") || event.includes("orders.") || event.includes("order.")) {
    if (DONE.has(status)) {
      await ensureInviteForOrder(db, data, eventRaw);
    }
    if (CANCEL.has(status)) {
      await voidInvitesForOrder(db, orderId, `status_${status}`);
    }
  }

  // 6) Log processed
  await db
    .collection("processed_events")
    .doc(keyOf(event, orderId, status))
    .set({ at: Date.now(), event, processed: true, status }, { merge: true });

  return res.status(200).json({ ok: true });
}
