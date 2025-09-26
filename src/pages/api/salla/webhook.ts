import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import { dbAdmin } from "@/lib/firebaseAdmin";
import { createShortLink } from "@/server/short-links";
import { sendEmailDmail as sendEmail } from "@/server/messaging/email-dmail";
import { sendSms, buildInviteSMS } from "@/server/messaging/send-sms";

export const config = { api: { bodyParser: false } };

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
  merchant?: string | number;
  data?: SallaOrder | UnknownRecord;
}

const WEBHOOK_SECRET = (process.env.SALLA_WEBHOOK_SECRET || "").trim();
const WEBHOOK_TOKEN = (process.env.SALLA_WEBHOOK_TOKEN || "").trim();
const DONE = new Set(["paid","fulfilled","delivered","completed","complete"]);
const CANCEL = new Set(["canceled","cancelled","refunded","returned"]);
const lc = (x: unknown) => String(x ?? "").toLowerCase();
const keyOf = (event: string, orderId?: string, status?: string) =>
  `salla:${lc(event)}:${orderId ?? "none"}:${status ?? ""}`;

// --- Signature Verification (per Salla docs) ---
function getHeader(req: NextApiRequest, name: string): string {
  const v = req.headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] || "" : (v || "");
}
function verifySallaSignature(raw: Buffer, req: NextApiRequest): boolean {
  const sigHeader = getHeader(req, "x-salla-signature");
  if (!WEBHOOK_SECRET || !sigHeader) return false;
  const expected = crypto.createHmac("sha256", WEBHOOK_SECRET).update(raw).digest("hex");
  // DEBUG LOGGING
  console.log("[DEBUG][SALLA] sigHeader:", sigHeader);
  console.log("[DEBUG][SALLA] expected :", expected);
  console.log("[DEBUG][SALLA] raw (first 200):", raw.toString("utf8").slice(0, 200));
  return crypto.timingSafeEqual(Buffer.from(sigHeader), Buffer.from(expected));
}
function extractProvidedToken(req: NextApiRequest): string {
  const auth = getHeader(req, "authorization").trim();
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  const hToken = getHeader(req, "x-salla-token").trim() || getHeader(req, "x-webhook-token").trim();
  if (hToken) return hToken;
  const q = typeof req.query.t === "string" ? req.query.t.trim() : "";
  return q;
}
function verifySallaToken(req: NextApiRequest): boolean {
  const provided = extractProvidedToken(req);
  if (!WEBHOOK_TOKEN || !provided) return false;
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(WEBHOOK_TOKEN));
}
function verifySallaRequest(req: NextApiRequest, raw: Buffer): { ok: boolean; strategy: string } {
  const strategy = lc(getHeader(req, "x-salla-security-strategy") || "");
  if (strategy === "signature") {
    return { ok: verifySallaSignature(raw, req), strategy: "signature" };
  } else if (strategy === "token") {
    return { ok: verifySallaToken(req), strategy: "token" };
  } else {
    // Try signature first, then token
    if (verifySallaSignature(raw, req)) return { ok: true, strategy: "signature" };
    if (verifySallaToken(req)) return { ok: true, strategy: "token" };
    return { ok: false, strategy: "none" };
  }
}

// --- Helpers ---
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
function pickStoreUidFromSalla(eventData: UnknownRecord, bodyMerchant?: string | number): string | undefined {
  if (bodyMerchant !== undefined && bodyMerchant !== null) {
    return `salla:${String(bodyMerchant)}`;
  }
  const store = eventData["store"] as UnknownRecord | undefined;
  const merchant = eventData["merchant"] as UnknownRecord | undefined;
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
function validateCustomerData(customer?: SallaCustomer): {
  isValid: boolean; hasEmail: boolean; hasMobile: boolean; email?: string; mobile?: string;
} {
  if (!customer) return { isValid: false, hasEmail: false, hasMobile: false };
  const email = customer.email?.trim();
  const mobile = customer.mobile?.trim();
  const hasEmail = !!email && email.includes("@");
  const hasMobile = !!mobile && mobile.length > 5;
  return {
    isValid: hasEmail || hasMobile,
    hasEmail,
    hasMobile,
    email: hasEmail ? email : undefined,
    mobile: hasMobile ? mobile : undefined
  };
}
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
  return url.replace(/:/g, "_COLON_").replace(/\//g, "_SLASH_").replace(/\?/g, "_QUEST_").replace(/#/g, "_HASH_").replace(/&/g, "_AMP_");
}
async function readRawBody(req: NextApiRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// --- DB Operations ---
async function upsertOrderSnapshot(
  db: FirebaseFirestore.Firestore,
  order: SallaOrder,
  storeUid?: string | null
): Promise<void> {
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
  eventRaw: UnknownRecord,
  bodyMerchant?: string | number
): Promise<void> {
  const orderId = String(order.id ?? order.order_id ?? "");
  if (!orderId) return;

  // Try to get customer from all possible places
  let customer = order.customer as SallaCustomer | undefined;
  if (!customer || (!customer.email && !customer.mobile)) {
    // Try fallback from eventRaw
    customer = (eventRaw["customer"] as SallaCustomer) || customer;
  }
  const customerValidation = validateCustomerData(customer);
  if (!customerValidation.isValid) {
    console.log("[SALLA][INVITE] skipping - no valid customer contact info", { orderId });
    return;
  }

  // Idempotency
  const invitesSnap = await db.collection("review_invites")
    .where("orderId", "==", orderId).limit(1).get();
  if (!invitesSnap.empty) return;

  let storeUid: string | null = pickStoreUidFromSalla(eventRaw, bodyMerchant) || null;
  if (!storeUid) {
    try {
      const orderDoc = await db.collection("orders").doc(orderId).get();
      storeUid = (orderDoc.data()?.storeUid as string) || null;
    } catch { storeUid = null; }
  }

  const productIds = extractProductIds(order.items);
  const mainProductId = productIds[0] || orderId;

  const tokenId = crypto.randomBytes(10).toString("hex");
  const base = (
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    ""
  ).replace(/\/+$/, "");
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

  await db.collection("review_invites").add({
    tokenId,
    orderId,
    platform: "salla",
    storeUid,
    productId: mainProductId,
    productIds,
    customer: {
      name: customer?.name ?? null,
      email: customerValidation.email ?? null,
      mobile: customerValidation.mobile ?? null
    },
    sentAt: Date.now(),
    deliveredAt: null,
    clicks: 0,
    publicUrl,
  });

  // Send messages
  const storeName = getStoreOrMerchantName(eventRaw) ?? "متجرك";
  const tasks: Array<Promise<unknown>> = [];

  if (customerValidation.hasMobile && customerValidation.mobile) {
    const mobile = customerValidation.mobile.replace(/\s+/g, "");
    const smsText = buildInviteSMS(storeName, publicUrl);
    tasks.push(
      sendSms(mobile, smsText, {
        defaultCountry: "SA",
        msgClass: "transactional",
        priority: 1,
        requestDlr: true,
      }).catch((error) => {
        console.error("[SALLA][SMS] failed to send", {
          orderId, mobile,
          error: error instanceof Error ? error.message : String(error)
        });
      })
    );
  }

  if (customerValidation.hasEmail && customerValidation.email) {
    const name = customer?.name || "عميلنا العزيز";
    const emailHtml = `
      <div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.7">
        <p>مرحباً ${name},</p>
        <p>قيّم تجربتك من <strong>${storeName}</strong>.</p>
        <p><a href="${publicUrl}" style="background:#16a34a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">اضغط للتقييم الآن</a></p>
        <p style="color:#64748b">فريق ثقة</p>
      </div>`;
    tasks.push(
      sendEmail(customerValidation.email, "قيّم تجربتك معنا", emailHtml).catch((error) => {
        console.error("[SALLA][EMAIL] failed to send", {
          orderId,
          email: customerValidation.email,
          error: error instanceof Error ? error.message : String(error)
        });
      })
    );
  }

  if (tasks.length > 0) {
    await Promise.allSettled(tasks);
    console.log("[SALLA][INVITE] sent", {
      orderId,
      smsCount: customerValidation.hasMobile ? 1 : 0,
      emailCount: customerValidation.hasEmail ? 1 : 0
    });
  } else {
    console.warn("[SALLA][INVITE] no messages sent - no valid contact methods", { orderId });
  }
}

async function voidInvitesForOrder(
  db: FirebaseFirestore.Firestore,
  orderId: string,
  reason: string
): Promise<void> {
  if (!orderId) return;
  try {
    const q = await db.collection("review_tokens").where("orderId", "==", orderId).get();
    if (q.empty) {
      console.log("[SALLA][VOID] no tokens found for order", { orderId });
      return;
    }
    const batch = db.batch();
    q.docs.forEach((doc) => {
      batch.update(doc.ref, {
        voidedAt: Date.now(),
        voidReason: reason
      });
    });
    await batch.commit();
    console.log("[SALLA][VOID] voided tokens", { orderId, count: q.docs.length, reason });
  } catch (error) {
    console.error("[SALLA][VOID] failed to void tokens", {
      orderId, reason,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

async function maybeSaveDomain(
  db: FirebaseFirestore.Firestore,
  uid: string,
  data: UnknownRecord,
  event: string
): Promise<void> {
  const domainSources = [
    data?.["domain"],
    data?.["store_url"],
    data?.["url"],
    (data?.["store"] as UnknownRecord)?.["domain"],
    (data?.["store"] as UnknownRecord)?.["url"],
    (data?.["merchant"] as UnknownRecord)?.["domain"],
    (data?.["merchant"] as UnknownRecord)?.["url"]
  ];
  let domainRaw: string | undefined;
  for (const source of domainSources) {
    if (source && typeof source === "string") {
      domainRaw = source;
      break;
    }
  }
  if (!domainRaw) {
    console.log("[SALLA][DOMAIN] no domain found in event data", { event, uid, dataKeys: Object.keys(data) });
    return;
  }
  const base = toDomainBase(domainRaw);
  if (!base) {
    console.log("[SALLA][DOMAIN] invalid domain format", { event, uid, domainRaw });
    return;
  }
  const key = encodeUrlForFirestore(base);
  try {
    await db.collection("stores").doc(uid).set({
      domain: { base, key, updatedAt: Date.now() },
      updatedAt: Date.now(),
    }, { merge: true });
    await db.collection("domains").doc(key).set({
      base,
      key,
      uid,
      provider: "salla",
      updatedAt: Date.now(),
    }, { merge: true });
    console.log("[SALLA][DOMAIN] saved successfully", { uid, base, key });
  } catch (error) {
    console.error("[SALLA][DOMAIN] failed to save", {
      uid, base, key,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

// --- Main Handler ---
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  const raw = await readRawBody(req);

  // Security check
  const verification = verifySallaRequest(req, raw);
  if (!verification.ok) {
    console.error("[SALLA][AUTH] invalid request", {
      strategy: getHeader(req, "x-salla-security-strategy") || "auto",
      hasSecret: !!WEBHOOK_SECRET,
      hasToken: !!WEBHOOK_TOKEN,
      from: req.headers["x-forwarded-for"] || req.socket.remoteAddress,
      body: raw.toString("utf8"),
      reason: "signature/token mismatch or duplicate"
    });
    return res.status(401).json({ error: "unauthorized" });
  }

  // Fast ACK
  res.status(202).json({ ok: true, accepted: true });

  // Background processing
  const db = dbAdmin();

  let body: SallaWebhookBody = { event: "" };
  try {
    body = JSON.parse(raw.toString("utf8") || "{}") as SallaWebhookBody;
  } catch (parseError) {
    console.error("[SALLA][PARSE] invalid JSON", {
      error: parseError instanceof Error ? parseError.message : String(parseError),
      rawLength: raw.length,
      raw: raw.toString("utf8")
    });
    await db.collection("webhook_errors").add({
      at: Date.now(),
      scope: "parse",
      error: "invalid_json",
      headers: req.headers,
      rawLen: raw.length,
      raw: raw.toString("utf8")
    }).catch(() => {});
    return;
  }

  const event = String(body.event || "");
  const dataRaw = (body.data ?? {}) as UnknownRecord;
  const asOrder = dataRaw as SallaOrder;

  // Idempotency: Use signature + raw body
  const sigHeader = getHeader(req, "x-salla-signature");
  const idemKey = crypto.createHash("sha256")
    .update((sigHeader || "") + "|")
    .update(raw)
    .digest("hex");
  const idemRef = db.collection("webhooks_salla").doc(idemKey);

  try {
    if ((await idemRef.get()).exists) {
      console.log("[SALLA][IDEMP] duplicate request detected", { event });
      return;
    }
    await idemRef.set({
      at: Date.now(),
      event,
      orderId: String(asOrder.id ?? asOrder.order_id ?? "") || null,
      status: lc(asOrder.status ?? asOrder.order_status ?? asOrder.new_status ?? asOrder.shipment_status ?? ""),
      paymentStatus: lc(asOrder.payment_status ?? ""),
      merchant: body.merchant ?? null,
      strategy: verification.strategy ?? "auto",
    });
  } catch (error) {
    console.error("[SALLA][IDEMP] failed to check/set idempotency", {
      error: error instanceof Error ? error.message : String(error)
    });
  }

  // Save domain for relevant events
  if (event === "app.store.authorize" || event === "app.installed") {
    const uid = body.merchant !== undefined
      ? `salla:${String(body.merchant)}`
      : (asOrder?.merchant?.id !== undefined ? `salla:${String(asOrder.merchant.id)}` : "salla:unknown");
    if (uid !== "salla:unknown") {
      await maybeSaveDomain(db, uid, dataRaw, event).catch((error) => {
        console.error("[SALLA][DOMAIN] failed to save domain", {
          event, uid,
          error: error instanceof Error ? error.message : String(error)
        });
      });
    }
  }

  // Main event processing
  try {
    const orderId = String(asOrder.id ?? asOrder.order_id ?? "");
    const status = lc(asOrder.status ?? asOrder.order_status ?? asOrder.new_status ?? asOrder.shipment_status ?? "");
    const paymentStatus = lc(asOrder.payment_status ?? "");

    // Save order snapshot for order/shipment events
    if (event.startsWith("order.") || event.startsWith("shipment.")) {
      const storeUidFromEvent = pickStoreUidFromSalla(dataRaw, body.merchant) || null;
      await upsertOrderSnapshot(db, asOrder, storeUidFromEvent);
    }

    // Invite/void logic
    if (event === "order.payment.updated") {
      if (["paid", "authorized", "captured"].includes(paymentStatus)) {
        await ensureInviteForOrder(db, asOrder, dataRaw, body.merchant);
      }
    } else if (event === "shipment.updated") {
      if (DONE.has(status) || ["delivered", "completed"].includes(status)) {
        await ensureInviteForOrder(db, asOrder, dataRaw, body.merchant);
      }
    } else if (event === "order.status.updated") {
      if (DONE.has(status)) {
        await ensureInviteForOrder(db, asOrder, dataRaw, body.merchant);
      }
    } else if (event === "order.cancelled") {
      await voidInvitesForOrder(db, orderId, "order_cancelled");
    } else if (event === "order.refunded") {
      await voidInvitesForOrder(db, orderId, "order_refunded");
    } else if (
      event.startsWith("order.") || event.startsWith("shipment.") ||
      event.startsWith("product.") || event.startsWith("customer.") ||
      event.startsWith("category.") || event.startsWith("brand.") ||
      event.startsWith("store.") || event.startsWith("cart.") ||
      event.startsWith("invoice.") || event.startsWith("specialoffer.") ||
      event === "review.added"
    ) {
      await db.collection("webhooks_salla_known").add({
        at: Date.now(),
        event,
        data: dataRaw
      }).catch(() => {});
    } else {
      await db.collection("webhooks_salla_unhandled").add({
        at: Date.now(),
        event,
        data: dataRaw
      }).catch(() => {});
      console.log("[SALLA][OK] unhandled event stored", { event });
    }

    await db.collection("processed_events")
      .doc(keyOf(event, orderId, status))
      .set({
        at: Date.now(),
        event,
        processed: true,
        status
      }, { merge: true });

    console.log("[SALLA][OK] event processed successfully", { event, orderId, status });

  } catch (processingError) {
    const errorMessage = processingError instanceof Error ? processingError.message : String(processingError);
    console.error("[SALLA][ERROR] handler processing failed", {
      event,
      error: errorMessage,
      stack: processingError instanceof Error ? processingError.stack : undefined
    });
    await db.collection("webhook_errors").add({
      at: Date.now(),
      scope: "handler",
      event,
      error: errorMessage,
      orderId: String((body.data as SallaOrder)?.id ?? (body.data as SallaOrder)?.order_id ?? "") || null,
      raw: raw.toString("utf8")
    }).catch(() => {});
  }
}