// src/pages/api/salla/webhook.ts
import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import { dbAdmin } from "@/lib/firebaseAdmin";
import { createShortLink } from "@/server/short-links";
import { sendEmailDmail as sendEmail } from "@/server/messaging/email-dmail";
import { sendSms } from "@/server/messaging/send-sms";

export const config = { api: { bodyParser: false } };

type UnknownRecord = Record<string, unknown>;

interface SallaCustomer { name?: string; email?: string; mobile?: string; }
interface SallaItem { id?: string|number; product?: { id?: string|number }|null; product_id?: string|number; }
interface SallaOrder {
  id?: string|number; order_id?: string|number; number?: string|number;
  status?: string; order_status?: string; new_status?: string; shipment_status?: string;
  customer?: SallaCustomer; items?: SallaItem[];
  store?: { id?: string|number; name?: string } | null;
  merchant?: { id?: string|number; name?: string } | null;
}
interface SallaWebhookBody { event: string; data?: SallaOrder | UnknownRecord; }

const WEBHOOK_TOKEN = (process.env.SALLA_WEBHOOK_TOKEN || "").trim();

const DONE   = new Set(["paid","fulfilled","delivered","completed","complete"]);
const CANCEL = new Set(["canceled","cancelled","refunded","returned"]);
const lc = (x: unknown) => String(x ?? "").toLowerCase();
const keyOf = (event: string, orderId?: string, status?: string) =>
  `salla:${lc(event)}:${orderId ?? "none"}:${status ?? ""}`;

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
function getHeader(req: NextApiRequest, name: string): string {
  const v = req.headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] || "" : (v || "");
}
function extractProvidedToken(req: NextApiRequest): string {
  const auth = getHeader(req, "authorization").trim();
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  const h1 = getHeader(req, "x-webhook-token").trim();
  if (h1) return h1;
  const h2 = getHeader(req, "x-salla-token").trim();
  if (h2) return h2;
  const q = typeof req.query.t === "string" ? req.query.t.trim() : "";
  return q;
}
function pickName(obj: unknown): string | undefined {
  if (obj && typeof obj === "object" && "name" in obj) {
    const n = (obj as { name?: unknown }).name;
    return typeof n === "string" ? n : undefined;
  }
  return undefined;
}
function getStoreOrMerchantName(ev: UnknownRecord): string | undefined {
  return pickName(ev["store"]) ?? pickName(ev["merchant"]);
}
function pickStoreUidFromSalla(o: UnknownRecord): string | undefined {
  const store = o["store"] as UnknownRecord | undefined;
  const merchant = o["merchant"] as UnknownRecord | undefined;
  const sid = store?.["id"] ?? merchant?.["id"];
  return sid !== undefined ? String(sid) : undefined;
}
function extractProductIds(items?: SallaItem[]): string[] {
  if (!Array.isArray(items)) return [];
  const ids = new Set<string>();
  for (const it of items) {
    const raw = it?.product_id ?? it?.product?.id ?? it?.id;
    if (raw !== undefined && raw !== null) ids.add(String(raw));
  }
  return [...ids];
}

async function upsertOrderSnapshot(
  db: FirebaseFirestore.Firestore,
  order: SallaOrder,
  storeUid?: string | null
) {
  const orderId = String(order.id ?? order.order_id ?? "");
  if (!orderId) return;
  await db.collection("orders").doc(orderId).set({
    id: orderId,
    number: order.number ?? null,
    status: lc(order.status ?? order.order_status ?? order.new_status ?? order.shipment_status ?? ""),
    customer: {
      name: order.customer?.name ?? null,
      email: order.customer?.email ?? null,
      mobile: order.customer?.mobile ?? null,
    },
    storeUid: storeUid ?? null,
    platform: "salla",
    updatedAt: Date.now(),
  }, { merge: true });
}

async function ensureInviteForOrder(
  db: FirebaseFirestore.Firestore,
  order: SallaOrder,
  eventRaw: UnknownRecord
) {
  const orderId = String(order.id ?? order.order_id ?? "");
  if (!orderId) return;

  const invitesSnap = await db.collection("review_invites").where("orderId","==",orderId).limit(1).get();
  if (!invitesSnap.empty) return;

  let storeUid: string | null = pickStoreUidFromSalla(eventRaw) || null;
  if (!storeUid) {
    try {
      const o = await db.collection("orders").doc(orderId).get();
      storeUid = (o.data()?.storeUid as string) || null;
    } catch { storeUid = null; }
  }

  const productIds = extractProductIds((order as SallaOrder).items);
  if (productIds.length === 0) {
    const rawItems = (eventRaw["items"] as SallaItem[] | undefined) ?? [];
    productIds.push(...extractProductIds(rawItems));
  }
  const mainProductId = productIds[0] || orderId;

  const tokenId = crypto.randomBytes(10).toString("hex");
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL || "";
  if (!base) throw new Error("BASE_URL not configured");

  const reviewUrl = `${base.replace(/\/+$/,"")}/review/${tokenId}`;
  const publicUrl = await createShortLink(reviewUrl);

  await db.collection("review_tokens").doc(tokenId).set({
    id: tokenId,
    platform: "salla",
    orderId,
    storeUid,
    productId: mainProductId,
    productIds,
    createdAt: Date.now(),
    usedAt: null,
    publicUrl,
    targetUrl: reviewUrl,
    channel: "multi",
  });

  const buyer = order.customer ?? {};
  await db.collection("review_invites").add({
    tokenId, orderId, platform: "salla",
    storeUid, productId: mainProductId, productIds,
    customer: { name: buyer.name ?? null, email: buyer.email ?? null, mobile: buyer.mobile ?? null },
    sentAt: Date.now(), deliveredAt: null, clicks: 0, publicUrl,
  });

  const name = buyer.name || "عميلنا العزيز";
  const storeName = getStoreOrMerchantName(eventRaw) ?? "متجرك";
  const smsText = `مرحباً ${name}، قيّم تجربتك من ${storeName}: ${publicUrl}`;

  const tasks: Array<Promise<unknown>> = [];
  if (buyer.mobile) {
    const mobile = String(buyer.mobile).replace(/\s+/g, "");
    tasks.push(sendSms(mobile, smsText));
  }
  if (buyer.email) {
    const emailHtml = `
      <div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.7">
        <p>مرحباً ${name}،</p>
        <p>قيّم تجربتك من <strong>${storeName}</strong>.</p>
        <p><a href="${publicUrl}" style="background:#16a34a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">اضغط للتقييم الآن</a></p>
        <p style="color:#64748b">فريق ثقة</p>
      </div>`;
    tasks.push(sendEmail(buyer.email, "قيّم تجربتك معنا", emailHtml));
  }
  await Promise.allSettled(tasks);
}

async function voidInvitesForOrder(db: FirebaseFirestore.Firestore, orderId: string, reason: string) {
  if (!orderId) return;
  const q = await db.collection("review_tokens").where("orderId","==",orderId).get();
  const batch = db.batch();
  q.docs.forEach((d) => batch.update(d.ref, { voidedAt: Date.now(), voidReason: reason }));
  await batch.commit();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  // ✅ يقبل Bearer / x-webhook-token / x-salla-token / ?t=
  const provided = extractProvidedToken(req);
  if (!WEBHOOK_TOKEN || !provided || !timingSafeEq(provided, WEBHOOK_TOKEN)) {
    return res.status(401).json({ error: "invalid_webhook_token" });
  }

  const raw = await readRawBody(req);
  const db = dbAdmin();

  let body: SallaWebhookBody = { event: "" };
  try {
    body = JSON.parse(raw.toString("utf8") || "{}") as SallaWebhookBody;
  } catch {
    return res.status(400).json({ error: "invalid_json" });
  }

  const event = String(body.event || "");
  const data = (body.data ?? {}) as SallaOrder;
  const orderId = String(data.id ?? data.order_id ?? "");
  const status = lc(data.status ?? data.order_status ?? data.new_status ?? data.shipment_status ?? "");

  // Idempotency
  const idemKey = crypto.createHash("sha256").update(provided + "|").update(raw).digest("hex");
  const idemRef = db.collection("webhooks_salla").doc(idemKey);
  if ((await idemRef.get()).exists) return res.status(200).json({ ok: true, deduped: true });
  await idemRef.set({ at: Date.now(), event, orderId, status });

  const eventRaw = (body.data ?? {}) as UnknownRecord;
  const storeUidFromEvent = pickStoreUidFromSalla(eventRaw) || null;
  await upsertOrderSnapshot(db, data, storeUidFromEvent);

  if (event.includes("orders.status.update") || event.includes("orders.") || event.includes("order.")) {
    if (DONE.has(status))   await ensureInviteForOrder(db, data, eventRaw);
    if (CANCEL.has(status)) await voidInvitesForOrder(db, orderId, `status_${status}`);
  }

  await db.collection("processed_events")
    .doc(keyOf(event, orderId, status))
    .set({ at: Date.now(), event, processed: true, status }, { merge: true });

  return res.status(200).json({ ok: true });
}
