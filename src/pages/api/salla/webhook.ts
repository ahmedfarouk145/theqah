// src/pages/api/salla/webhook.ts
import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import { dbAdmin } from "@/lib/firebaseAdmin";
import { createShortLink } from "@/server/short-links";
import { sendEmailDmail as sendEmail } from "@/server/messaging/email-dmail";
import { sendSms, buildInviteSMS } from "@/server/messaging/send-sms";

export const config = { api: { bodyParser: false } };

// -------------------- Types --------------------
type UnknownRecord = Record<string, unknown>;

interface SallaCustomer { name?: string; email?: string; mobile?: string; }
interface SallaItem { id?: string|number; product?: { id?: string|number }|null; product_id?: string|number; }
interface SallaOrder {
  id?: string|number; order_id?: string|number; number?: string|number;
  status?: string; order_status?: string; new_status?: string; shipment_status?: string;
  payment_status?: string;
  customer?: SallaCustomer; items?: SallaItem[];
  store?: { id?: string|number; name?: string } | null;
  merchant?: { id?: string|number; name?: string } | null;
}
interface SallaWebhookBody {
  event: string;
  merchant?: string | number;     // لأحداث app.* (لو استخدمتها)
  data?: SallaOrder | UnknownRecord;
}

// -------------------- Consts & helpers --------------------
const WEBHOOK_SECRET  = (process.env.SALLA_WEBHOOK_SECRET || "").trim(); // يفضل للـ Signature
const WEBHOOK_TOKEN   = (process.env.SALLA_WEBHOOK_TOKEN  || "").trim(); // للـ Token / fallback
const DONE  = new Set(["paid","fulfilled","delivered","completed","complete"]);
const CANCEL= new Set(["canceled","cancelled","refunded","returned"]);
const lc = (x: unknown) => String(x ?? "").toLowerCase();
const keyOf = (event: string, orderId?: string, status?: string) =>
  `salla:${lc(event)}:${orderId ?? "none"}:${status ?? ""}`;

// ===== DOMAIN HELPERS =====
function toDomainBase(domain: string | null | undefined): string | null {
  if (!domain) return null;
  try {
    const u = new URL(String(domain));
    const origin = u.origin.toLowerCase();
    const firstSeg = u.pathname.split("/").filter(Boolean)[0] || "";
    return firstSeg && firstSeg.startsWith("dev-") ? `${origin}/${firstSeg}` : origin;
  } catch { return null; }
}
function encodeUrlForFirestore(url: string | null | undefined): string {
  if (!url) return "";
  return url
    .replace(/:/g, "_COLON_")
    .replace(/\//g, "_SLASH_")
    .replace(/\?/g, "_QUEST_")
    .replace(/#/g, "_HASH_")
    .replace(/&/g, "_AMP_");
}

// ===== IO helpers =====
function readRawBody(req: NextApiRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
function timingSafeEq(a: string, b: string) {
  const A = Buffer.from(a); const B = Buffer.from(b);
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
  const hToken = getHeader(req, "x-salla-token").trim() || getHeader(req, "x-webhook-token").trim();
  if (hToken) return hToken;
  const q = typeof req.query.t === "string" ? req.query.t.trim() : "";
  return q;
}

// ===== Security (Signature / Token) =====
// الدوكس: X-Salla-Security-Strategy + X-Salla-Signature (للـ Signature)  و Token كخيار آخر
// https://docs.salla.dev/421119m0  (Security Strategies / Verify Webhooks Using Signature / Timeout & Retries)
function sha256Hex(data: Buffer | string) {
  return crypto.createHash("sha256").update(data).digest("hex");
}
function hmacSha256Hex(key: string, data: Buffer | string) {
  return crypto.createHmac("sha256", key).update(data).digest("hex");
}

function verifyBySignature(raw: Buffer, headerSig: string): boolean {
  const secret = WEBHOOK_SECRET || WEBHOOK_TOKEN; // مرونة لو حدّثت متغيرات البيئة
  if (!secret || !headerSig) return false;

  // طريقتين للتحقق (لتغطية غموض الصياغة في الدوكس): sha256(body+secret) أو HMAC(secret, body)
  const try1 = sha256Hex(Buffer.concat([raw, Buffer.from(secret)]));
  const try2 = hmacSha256Hex(secret, raw);
  return timingSafeEq(headerSig, try1) || timingSafeEq(headerSig, try2);
}

function verifyByToken(provided: string): boolean {
  if (!WEBHOOK_TOKEN) return false;
  if (!provided) return false;
  return timingSafeEq(provided, WEBHOOK_TOKEN);
}

function verifySallaRequest(req: NextApiRequest, raw: Buffer): { ok: boolean; strategy?: string; reason?: string } {
  const strategy = lc(getHeader(req, "x-salla-security-strategy") || "");
  const sigHeader = (getHeader(req, "x-salla-signature") || "").trim();
  const tok = extractProvidedToken(req);

  // لو الاستراتيجية محددة، نتبعها. لو لأ، نحاول الاثنين بترتيب: Signature ثم Token.
  if (strategy === "signature") {
    const ok = verifyBySignature(raw, sigHeader);
    return { ok, strategy: "signature", reason: ok ? undefined : "bad_signature" };
  } else if (strategy === "token") {
    const ok = verifyByToken(tok);
    return { ok, strategy: "token", reason: ok ? undefined : "bad_token" };
  } else {
    // غير محدد: نجرب Signature ثم Token
    if (sigHeader && verifyBySignature(raw, sigHeader)) return { ok: true, strategy: "signature" };
    if (verifyByToken(tok)) return { ok: true, strategy: "token" };
    return { ok: false, reason: "no_valid_strategy" };
  }
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
  return sid !== undefined ? `salla:${String(sid)}` : undefined;
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

// -------------------- DB ops --------------------
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
    paymentStatus: lc(order.payment_status ?? ""),
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

  // idempotency على دعوات الطلب
  const invitesSnap = await db.collection("review_invites")
    .where("orderId","==",orderId).limit(1).get();
  if (!invitesSnap.empty) return;

  let storeUid: string | null = pickStoreUidFromSalla(eventRaw) || null;
  if (!storeUid) {
    try {
      const o = await db.collection("orders").doc(orderId).get();
      storeUid = (o.data()?.storeUid as string) || null;
    } catch { storeUid = null; }
  }

  const productIds = extractProductIds((order as SallaOrder).items);
  const mainProductId = productIds[0] || orderId;

  const tokenId = crypto.randomBytes(10).toString("hex");
  const base =
    (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || "").replace(/\/+$/,"");
  if (!base) throw new Error("BASE_URL not configured");

  const reviewUrl = `${base}/review/${tokenId}`;
  const publicUrl = await createShortLink(reviewUrl).catch(() => reviewUrl);

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

  const storeName = getStoreOrMerchantName(eventRaw) ?? "متجرك";
  const smsText = buildInviteSMS(storeName, publicUrl);

  const tasks: Array<Promise<unknown>> = [];
  if (buyer.mobile) {
    const mobile = String(buyer.mobile).replace(/\s+/g, "");
    tasks.push(
      sendSms(mobile, smsText, {
        defaultCountry: "SA",
        msgClass: "transactional",
        priority: 1,
        requestDlr: true,
      })
    );
  }
  if (buyer.email) {
    const name = buyer.name || "عميلنا العزيز";
    const emailHtml = `
      <div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.7">
        <p>مرحباً ${name},</p>
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

// ===== Domain saver (عند authorize/installed إن وُجد) =====
async function maybeSaveDomain(db: FirebaseFirestore.Firestore, uid: string, data: UnknownRecord, event: string) {
  const domainRaw =
    (data as Record<string, unknown>)?.["domain"] ??
    (data as Record<string, unknown>)?.["store_url"] ??
    (data as Record<string, unknown>)?.["url"] ??
    ((data as Record<string, unknown>)?.["store"] as UnknownRecord | undefined)?.["domain"];

  const base = toDomainBase(typeof domainRaw === "string" ? domainRaw : String(domainRaw ?? ""));
  if (!base) {
    console.log("[SALLA][DOMAIN] no domain found in event data", { event, uid });
    return;
  }
  const key = encodeUrlForFirestore(base);

  await db.collection("stores").doc(uid).set({
    domain: { base, key, updatedAt: Date.now() },
    updatedAt: Date.now(),
  }, { merge: true });

  await db.collection("domains").doc(key).set({
    base, key, uid, provider: "salla", updatedAt: Date.now(),
  }, { merge: true });

  console.log("[SALLA][DOMAIN] saved", { uid, base, key });
}

// -------------------- Handler --------------------
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const raw = await readRawBody(req);

  // تحقق أمني حسب الدوكس (Signature/Token + الهيدر X-Salla-Security-Strategy)
  const v = verifySallaRequest(req, raw);
  if (!v.ok) {
    console.error("[SALLA][AUTH] invalid request", {
      strategy: getHeader(req, "x-salla-security-strategy") || "auto",
      reason: v.reason,
      hasSecret: !!WEBHOOK_SECRET,
      hasToken: !!WEBHOOK_TOKEN,
      from: req.headers["x-forwarded-for"] || req.socket.remoteAddress,
    });
    return res.status(401).json({ error: "unauthorized" });
  }

  // ✅ الرد السريع (سلة قد تعيد المحاولة 3 مرات خلال ~5 دقائق إن لم تحصل على 2xx)
  // نردّ 202 و نكمل المعالجة بالخلفية
  res.status(202).json({ ok: true, accepted: true });

  // من هنا نكمل في الخلفية
  const db = dbAdmin();

  let body: SallaWebhookBody = { event: "" };
  try {
    body = JSON.parse(raw.toString("utf8") || "{}") as SallaWebhookBody;
  } catch {
    console.error("[SALLA][PARSE] invalid_json");
    // نسجل ونخرج فقط (الرد أُرسل بالفعل)
    await db.collection("webhook_errors").add({
      at: Date.now(), scope: "parse", error: "invalid_json",
      headers: req.headers, rawLen: raw.length,
    }).catch(()=>{});
    return;
  }

  const event = String(body.event || "");
  const dataRaw = (body.data ?? {}) as UnknownRecord;
  const asOrder = dataRaw as SallaOrder;

  console.log("[SALLA][RECV]", {
    event,
    orderId: String(asOrder.id ?? asOrder.order_id ?? "") || null,
    hasCustomer: !!asOrder.customer,
    customerEmail: asOrder.customer?.email || null,
    strategy: v.strategy,
    at: new Date().toISOString(),
  });

  // Idempotency — باستخدام raw+secret
  const idemKey = crypto.createHash("sha256")
    .update((WEBHOOK_SECRET || WEBHOOK_TOKEN) + "|")
    .update(raw)
    .digest("hex");
  const idemRef = db.collection("webhooks_salla").doc(idemKey);
  if ((await idemRef.get()).exists) {
    console.log("[SALLA][IDEMP] deduped", { event });
    return;
  }
  await idemRef.set({
    at: Date.now(),
    event,
    orderId: String(asOrder.id ?? asOrder.order_id ?? "") || null,
    status: lc(asOrder.status ?? asOrder.order_status ?? asOrder.new_status ?? asOrder.shipment_status ?? ""),
    paymentStatus: lc(asOrder.payment_status ?? ""),
    merchant: body.merchant ?? null,
    strategy: v.strategy ?? "auto",
  });

  // ====== domain (لو حدث مناسب) ======
  if (event === "app.store.authorize" || event === "app.installed") {
    const uid = (dataRaw?.["merchant"] != null)
      ? `salla:${String(dataRaw["merchant"])}`
      : (asOrder?.merchant?.id != null ? `salla:${String(asOrder.merchant!.id)}` : "salla:unknown");
    if (uid !== "salla:unknown") {
      await maybeSaveDomain(db, uid, dataRaw, event).catch(()=>{});
    }
  }

  // ====== التعامل مع الأحداث الرسمية ======
  // المرجع: List of Salla Store Events (orders/products/customers/shipment..)
  // https://docs.salla.dev/421119m0
  try {
    const orderId = String(asOrder.id ?? asOrder.order_id ?? "");
    const status = lc(asOrder.status ?? asOrder.order_status ?? asOrder.new_status ?? asOrder.shipment_status ?? "");
    const paymentStatus = lc(asOrder.payment_status ?? "");
    const storeUidFromEvent = pickStoreUidFromSalla(dataRaw) || null;

    // snapshots (لو الحدث له علاقة بالطلبات/الشحن)
    if (event.startsWith("order.") || event.startsWith("shipment.")) {
      await upsertOrderSnapshot(db, asOrder, storeUidFromEvent);
    }

    // قواعد الإرسال (حسب منطقك التجاري)
    if (event === "order.payment.updated") {
      if (["paid","authorized","captured"].includes(paymentStatus)) {
        console.log("[SALLA][RULE] after_payment → ensureInvite", { orderId, paymentStatus });
        await ensureInviteForOrder(db, asOrder, dataRaw);
      }
    } else if (event === "shipment.updated") {
      if (DONE.has(status) || ["delivered","completed"].includes(status)) {
        console.log("[SALLA][RULE] after_delivery → ensureInvite", { orderId, status });
        await ensureInviteForOrder(db, asOrder, dataRaw);
      }
    } else if (event === "order.status.updated") {
      if (DONE.has(status)) {
        console.log("[SALLA][RULE] status.done → ensureInvite", { orderId, status });
        await ensureInviteForOrder(db, asOrder, dataRaw);
      }
    } else if (event === "order.cancelled") {
      console.log("[SALLA][RULE] cancelled → voidInvites", { orderId });
      await voidInvitesForOrder(db, orderId, "order_cancelled");
    } else if (event === "order.refunded") {
      console.log("[SALLA][RULE] refunded → voidInvites", { orderId });
      await voidInvitesForOrder(db, orderId, "order_refunded");
    } else if (
      // أحداث معروفة أخرى: نسجّلها فقط الآن — ممكن تضيف سلوك لاحقًا
      event.startsWith("order.") || event.startsWith("shipment.") ||
      event.startsWith("product.") || event.startsWith("customer.") ||
      event.startsWith("category.") || event.startsWith("brand.") ||
      event.startsWith("store.") || event.startsWith("cart.") ||
      event.startsWith("invoice.") || event.startsWith("specialoffer.") ||
      event === "review.added"
    ) {
      await db.collection("webhooks_salla_known").add({ at: Date.now(), event, data: dataRaw }).catch(()=>{});
    } else {
      // غير مذكور في اللستة → نسجله لنتتبعه
      await db.collection("webhooks_salla_unhandled").add({ at: Date.now(), event, data: dataRaw }).catch(()=>{});
      console.log("[SALLA][OK] unhandled event stored", { event });
    }

    await db.collection("processed_events")
      .doc(keyOf(event, orderId, status))
      .set({ at: Date.now(), event, processed: true, status }, { merge: true });

    console.log("[SALLA][OK] handled", { event, orderId, status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[SALLA][ERROR] handler_failed", { event, error: msg });
    await db.collection("webhook_errors").add({
      at: Date.now(), scope: "handler", event,
      error: msg,
    }).catch(()=>{});
  }
}
