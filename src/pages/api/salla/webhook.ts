// src/pages/api/salla/webhook.ts
import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import { dbAdmin } from "@/lib/firebaseAdmin";
import { fetchStoreInfo, fetchUserInfo, getOwnerAccessToken } from "@/lib/sallaClient";
import { canSendInvite, onInviteSent } from "@/server/subscription/usage";
import { sendPasswordSetupEmail } from "@/server/auth/send-password-email";
import { sendBothNow } from "@/server/messaging/send-invite";
import { createShortLink } from "@/server/short-links";

export const runtime = "nodejs";
export const config = { api: { bodyParser: false } };

/* ===================== Types ===================== */
type Dict = Record<string, unknown>;

interface SallaCustomer { name?: string; email?: string; mobile?: string | number; }
interface SallaItem { id?: string|number; product?: { id?: string|number }|null; product_id?: string|number; }
interface SallaOrder {
  id?: string|number; order_id?: string|number; number?: string|number;
  status?: string; order_status?: string; new_status?: string; shipment_status?: string;
  payment_status?: string;
  customer?: SallaCustomer; items?: SallaItem[];
  store?: { id?: string|number; name?: string; domain?: string; url?: string } | null;
  merchant?: { id?: string|number; name?: string; domain?: string; url?: string } | null;
}
interface SallaWebhookBody {
  event: string;
  merchant?: string | number;
  data?: SallaOrder | Dict;
  created_at?: string;
}

/* ===================== Env ===================== */
const WEBHOOK_SECRET = (process.env.SALLA_WEBHOOK_SECRET || "").trim();
const WEBHOOK_TOKEN  = (process.env.SALLA_WEBHOOK_TOKEN  || "").trim();
const APP_BASE_URL   = (
  process.env.APP_BASE_URL || 
  process.env.NEXT_PUBLIC_APP_URL || 
  process.env.NEXT_PUBLIC_BASE_URL || 
  (process.env.NODE_ENV === "development" ? "http://localhost:3000" : "")
).replace(/\/+$/,"");
const WEBHOOK_LOG_DEST = (process.env.WEBHOOK_LOG_DEST || "console").trim().toLowerCase(); // console | firestore
const ENABLE_FIRESTORE_LOGS = process.env.ENABLE_FIRESTORE_LOGS === "true"; // Better env control
const LOG_REVIEW_URLS = (process.env.LOG_REVIEW_URLS || "").trim().toLowerCase(); // "1"/"true" to log review url

/* ===================== Utils ===================== */
const lc = (x: unknown) => String(x ?? "").toLowerCase();
// const DONE = new Set(["paid","fulfilled","delivered","completed","complete","تم التوصيل","مكتمل","تم التنفيذ"]); // unused for now

// Safe mobile number handling - convert to string and handle null/undefined
function safeMobile(mobile: string | number | null | undefined): string | null {
  if (!mobile) return null;
  let cleaned = typeof mobile === 'string' ? mobile.trim() : String(mobile).trim();
  
  // ✅ إزالة الرموز غير المرغوبة
  cleaned = cleaned.replace(/[\s\-\(\)]/g, '');
  
  // ✅ إزالة + في البداية
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  }
  
  // ✅ إصلاح التكرار: 966966 → 966
  if (cleaned.startsWith('966966')) {
    cleaned = cleaned.substring(3);
  }
  
  // ✅ إضافة 966 لو الرقم يبدأ بـ 5 (رقم سعودي محلي)
  if (cleaned.startsWith('5') && cleaned.length === 9) {
    cleaned = '966' + cleaned;
  }
  
  return cleaned || null;
}

function getHeader(req: NextApiRequest, name: string): string {
  const v = req.headers[name.toLowerCase()];
  return Array.isArray(v) ? (v[0] || "") : (v || "");
}
function readRawBody(req: NextApiRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
function timingSafeEq(a: string, b: string) {
  try {
    const A = Buffer.from(a, "utf8"), B = Buffer.from(b, "utf8");
    if (A.length !== B.length) return false;
    return crypto.timingSafeEqual(A, B);
  } catch { return false; }
}

/* ---------- Security (signature/token/auto) ---------- */
function verifySignature(raw: Buffer, req: NextApiRequest): boolean {
  const sigHeader = getHeader(req, "x-salla-signature");
  if (!WEBHOOK_SECRET || !sigHeader) return false;
  const expected = crypto.createHmac("sha256", WEBHOOK_SECRET).update(raw).digest("hex");
  return timingSafeEq(sigHeader, expected);
}
function extractProvidedToken(req: NextApiRequest): string {
  const auth = getHeader(req, "authorization").trim();
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return getHeader(req, "x-salla-token").trim()
      || getHeader(req, "x-webhook-token").trim()
      || (typeof req.query.t === "string" ? req.query.t.trim() : "");
}
function verifyToken(req: NextApiRequest): boolean {
  const provided = extractProvidedToken(req);
  return !!WEBHOOK_TOKEN && !!provided && timingSafeEq(provided, WEBHOOK_TOKEN);
}
function verifySallaRequest(req: NextApiRequest, raw: Buffer): { ok: boolean; strategy: "signature"|"token"|"none" } {
  const strategy = lc(getHeader(req, "x-salla-security-strategy") || "");
  if (strategy === "signature") return { ok: verifySignature(raw, req), strategy: "signature" };
  if (strategy === "token")     return { ok: verifyToken(req),      strategy: "token" };
  if (verifySignature(raw, req)) return { ok: true, strategy: "signature" };
  if (verifyToken(req))          return { ok: true, strategy: "token" };
  return { ok: false, strategy: "none" };
}

/* ---------- Domain helpers ---------- */
function toDomainBase(domain: string | null | undefined): string | null {
  if (!domain) return null;
  try {
    const u = new URL(String(domain));
    const origin = u.origin.toLowerCase();
    const firstSeg = u.pathname.split("/").filter(Boolean)[0] || "";
    return firstSeg && firstSeg.startsWith("dev-") ? `${origin}/${firstSeg}` : origin;
  } catch { return null; }
}

function normalizeUrl(url: string): URL | null {
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`);
  } catch {
    return null;
  }
}

function saveMultipleDomainFormats(
  db: FirebaseFirestore.Firestore,
  uid: string,
  originalDomain: string | null | undefined
) {
  if (!originalDomain) return Promise.resolve();
  
  const u = normalizeUrl(originalDomain);
  if (!u) return Promise.resolve();
  
  const hostname = u.host.toLowerCase();
  const origin = u.origin.toLowerCase();
  const firstSeg = u.pathname.split("/").filter(Boolean)[0] || "";
  
  const domainsToSave = [
    origin, // https://demostore.salla.sa
    hostname, // demostore.salla.sa
  ];
  
  if (firstSeg.startsWith("dev-")) {
    domainsToSave.push(`${origin}/${firstSeg}`, `${hostname}/${firstSeg}`);
  }
  
  console.log(`[webhook] Saving multiple domain formats for ${uid}:`, domainsToSave);
  
  const promises = domainsToSave.map(domain => 
    db.collection("domains").doc(encodeUrlForFirestore(domain)).set({
      base: domain,
      key: encodeUrlForFirestore(domain),
      uid,
      storeUid: uid,
      provider: "salla",
      updatedAt: Date.now(),
    }, { merge: true }).catch(err => 
      console.warn(`[webhook] Failed to save domain ${domain}:`, err)
    )
  );
  
  return Promise.all(promises);
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
function pickName(obj: unknown): string | undefined {
  if (obj && typeof obj === "object" && "name" in obj) {
    const n = (obj as { name?: unknown }).name;
    return typeof n === "string" ? n : undefined;
  }
  return undefined;
}
function getStoreOrMerchantName(ev: Dict): string | undefined {
  return pickName(ev["store"]) ?? pickName(ev["merchant"]);
}
function pickStoreUidFromSalla(eventData: Dict, bodyMerchant?: string | number): string | undefined {
  if (bodyMerchant !== undefined && bodyMerchant !== null) return `salla:${String(bodyMerchant)}`;
  const store = eventData["store"] as Dict | undefined;
  const merchant = eventData["merchant"] as Dict | undefined;
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

// استخراج اسم المنتج الأساسي (أول منتج في الطلب)
function extractMainProductName(items?: SallaItem[]): string | undefined {
  if (!Array.isArray(items) || !items.length) return undefined;
  
  const firstItem = items[0];
  // جرب استخراج الاسم من عدة مصادر محتملة
  const unknownItem = firstItem as unknown;
  const name = 
    (unknownItem as { name?: string })?.name || 
    (unknownItem as { product?: { name?: string } })?.product?.name || 
    (unknownItem as { product_name?: string })?.product_name || 
    (unknownItem as { title?: string })?.title ||
    undefined;
    
  return typeof name === 'string' ? name.trim() : undefined;
}
function validEmailOrPhone(c?: SallaCustomer) {
  const email = c?.email?.trim(); 
  const mobile = safeMobile(c?.mobile);
  const hasEmail = !!email && email.includes("@");
  const hasMobile = !!mobile && mobile.length > 5;
  return { ok: hasEmail || hasMobile, email: hasEmail ? email : undefined, mobile: hasMobile ? mobile : undefined };
}
const keyOf = (event: string, orderId?: string, status?: string) => `salla:${lc(event)}:${orderId ?? "none"}:${status ?? ""}`;

/* ===================== Firestore Ops ===================== */
async function saveDomainAndFlags(
  db: FirebaseFirestore.Firestore,
  uid: string,
  merchantId: string | number | null,
  base: string | null | undefined,
  event: string
) {
  const now = Date.now();
  const storeDoc: Dict = {
    uid,
    provider: "salla",
    updatedAt: now,
    salla: {
      uid,
      storeId:
        typeof merchantId === "number" ? merchantId :
        typeof merchantId === "string" ? merchantId :
        null,
      connected: true,
      installed: true,
      ...(base ? { domain: base } : {}),
    },
    ...(base ? { domain: { base, key: encodeUrlForFirestore(base), updatedAt: now } } : {}),
  };

  // نظّف أي undefined
  Object.keys(storeDoc).forEach((k) => (storeDoc as Dict)[k] === undefined && delete (storeDoc as Dict)[k]);

  await db.collection("stores").doc(uid).set(storeDoc, { merge: true });

  if (base) {
    const key = encodeUrlForFirestore(base);
    await db.collection("domains").doc(key).set({
      base, key, uid, storeUid: uid, provider: "salla", updatedAt: now,
    }, { merge: true });
  }

  await db.collection("salla_app_events").add({
    at: now, event, type: "domain_flags_saved", uid, base: base ?? null,
  }).catch(() => {});
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
    paymentStatus: lc(order.payment_status ?? ""),
    customer: { name: order.customer?.name ?? null, email: order.customer?.email ?? null, mobile: safeMobile(order.customer?.mobile) },
    storeUid: storeUid ?? null,
    platform: "salla",
    updatedAt: Date.now(),
  }, { merge: true });
}

async function ensureInviteForOrder(
  db: FirebaseFirestore.Firestore,
  order: SallaOrder,
  rawData: Dict,
  bodyMerchant?: string|number
) {
  console.log(`[INVITE FLOW] Starting invite creation for order...`);
  
  const orderId = String(order.id ?? order.order_id ?? "");
  console.log(`[INVITE FLOW] 1. OrderId check: ${orderId || "MISSING"}`);
  if (!orderId) {
    console.log(`[INVITE FLOW] ❌ FAILED: No orderId found`);
    return;
  }

  let customer = order.customer as SallaCustomer | undefined;
  if (!customer?.email && !customer?.mobile) customer = (rawData["customer"] as SallaCustomer) || customer;
  if ((!customer?.email && !customer?.mobile) && rawData["order"] && typeof rawData["order"] === "object") {
    customer = (rawData["order"] as Dict)["customer"] as SallaCustomer || customer;
  }
  
  // Enhanced email and mobile extraction - try multiple sources
  let customerEmail = customer?.email || "";
  let customerMobile = customer?.mobile || "";
  
  if (!customerEmail || !customerMobile) {
    const orderData = rawData["order"] as Dict | undefined;
    
    if (!customerEmail) {
      customerEmail = 
        (orderData?.customer as Dict)?.email as string || 
        (orderData?.billing_address as Dict)?.email as string ||
        (orderData?.shipping_address as Dict)?.email as string ||
        "";
    }
    
    if (!customerMobile) {
      const mobiles = [
        (orderData?.customer as Dict)?.mobile,
        (orderData?.billing_address as Dict)?.mobile || (orderData?.billing_address as Dict)?.phone,
        (orderData?.shipping_address as Dict)?.mobile || (orderData?.shipping_address as Dict)?.phone,
        customer?.mobile
      ];
      
      for (const mob of mobiles) {
        if (mob) {
          customerMobile = typeof mob === 'string' ? mob : String(mob);
          break;
        }
      }
    }
  }
  
  // Normalize mobile format safely
  const normalizedMobile = safeMobile(customerMobile) || '';
  
  // If still no email, use mobile as fallback for SMS-only  
  const finalCustomer = customer ? {
    ...customer,
    email: customerEmail.trim() || customer.email || "",
    mobile: normalizedMobile
  } : undefined;
  
  console.log(`[INVITE FLOW] 2. Customer found: email=${customerEmail || "none"}, mobile=${finalCustomer?.mobile || "none"}`);
  
  const cv = validEmailOrPhone(finalCustomer);
  console.log(`[INVITE FLOW] 3. Customer validation: ${cv.ok ? "PASSED" : "FAILED"}`);
  if (!cv.ok) {
    console.log(`[INVITE FLOW] ❌ FAILED: No valid email or mobile`);
    return;
  }

  console.log(`[INVITE FLOW] 4. Checking for existing invites...`);
  const exists = await db.collection("review_invites").where("orderId", "==", orderId).limit(1).get();
  console.log(`[INVITE FLOW] 5. Existing invites: ${exists.size} found`);
  if (!exists.empty) {
    console.log(`[INVITE FLOW] ❌ SKIP: Invite already exists for order ${orderId}`);
    return;
  }

  // ✅ استخراج الحالة الحالية من الـ payload
  const statusObj = order.status ?? rawData["status"];
  const currentStatus = lc(
    typeof statusObj === "object" && statusObj !== null
      ? (statusObj.slug ?? statusObj.name ?? "")
      : (statusObj ?? order.order_status ?? order.new_status ?? "")
  );
  console.log(`[INVITE FLOW] 5.1. Current order status: "${currentStatus}"`);

  // ✅ التحقق من الحالة المحفوظة سابقاً (Status Tracking)
  const orderTrackingRef = db.collection("order_status_tracking").doc(orderId);
  const trackingSnap = await orderTrackingRef.get();
  const previousStatus = trackingSnap.exists ? lc(trackingSnap.data()?.status ?? "") : "";
  
  console.log(`[INVITE FLOW] 5.2. Previous status: "${previousStatus || "none"}", Current: "${currentStatus}"`);

  // ✅ تحديث الحالة المحفوظة
  await orderTrackingRef.set({
    orderId,
    status: currentStatus,
    updatedAt: Date.now(),
    storeUid: pickStoreUidFromSalla(rawData, bodyMerchant) || null
  }, { merge: true });
  console.log(`[INVITE FLOW] 5.3. Status tracking updated`);

  // ✅ فحص: هل الحالة الجديدة = "تم التوصيل" أو "تم التنفيذ"؟
  const isCompleted = 
    currentStatus === "completed" || 
    currentStatus === "تم التنفيذ" ||
    currentStatus === "delivered" ||
    currentStatus === "تم التوصيل";
  
  console.log(`[INVITE FLOW] 5.4. Is order completed? ${isCompleted}`);
  
  if (!isCompleted) {
    console.log(`[INVITE FLOW] ❌ SKIP: Order not completed yet (status: ${currentStatus}). Waiting for completion`);
    return;
  }
  
  // ✅ فحص: هل الحالة اتغيرت فعلاً؟ (نتجاهل التكرار إلا لو الحالة كانت محفوظة قبل كده)
  if (previousStatus && previousStatus === currentStatus) {
    console.log(`[INVITE FLOW] ❌ SKIP: Status unchanged (${currentStatus}), invite already sent before`);
    return;
  }
  
  if (previousStatus) {
    console.log(`[INVITE FLOW] ✅ Status changed from "${previousStatus}" to "${currentStatus}"`);
  } else {
    console.log(`[INVITE FLOW] ✅ First time seeing order with completed status "${currentStatus}"`);
  }
  
  console.log(`[INVITE FLOW] ✅ Proceeding with invite...`);

  let storeUid: string|null = pickStoreUidFromSalla(rawData, bodyMerchant) || null;
  console.log(`[INVITE FLOW] 6. StoreUid from payload: ${storeUid || "none"}`);
  if (!storeUid) {
    const orderDoc = await db.collection("orders").doc(orderId).get().catch(() => null);
    storeUid = (orderDoc?.data() as Dict | undefined)?.["storeUid"] as string | null ?? null;
    console.log(`[INVITE FLOW] 7. StoreUid from orders collection: ${storeUid || "none"}`);
  }

  console.log(`[INVITE FLOW] 8. Final storeUid: ${storeUid || "MISSING"}`);

  // فحص الخطة (لو عندك usage limits)
  const planCheck = storeUid ? await canSendInvite(storeUid) : { ok: true as const };
  console.log(`[INVITE FLOW] 9. Plan check: ${planCheck.ok ? "PASSED" : "FAILED"} - ${JSON.stringify(planCheck)}`);
  if (!planCheck.ok) {
    console.log(`[INVITE FLOW] ❌ FAILED: Quota exceeded - ${planCheck.reason}`);
    await db.collection("quota_events").add({
      at: Date.now(), storeUid, orderId, type: "invite_blocked", reason: planCheck.reason
    }).catch(()=>{});
    return;
  }

  const productIds = extractProductIds(order.items);
  const mainProductId = productIds[0] || orderId;
  const mainProductName = extractMainProductName(order.items);
  console.log(`[INVITE FLOW] 10. Product IDs extracted: ${productIds.length} items, main: ${mainProductId}`);
  console.log(`[INVITE FLOW] 10.1. Main product name: ${mainProductName || "N/A"}`);

  if (!APP_BASE_URL) {
    console.log(`[INVITE FLOW] ❌ FAILED: APP_BASE_URL not configured`);
    throw new Error("BASE_URL not configured");
  }
  console.log(`[INVITE FLOW] 11. APP_BASE_URL: ${APP_BASE_URL}`);

  const tokenId = crypto.randomBytes(10).toString("hex");
  const reviewUrl = `${APP_BASE_URL}/review/${tokenId}`;
  
  // ✅ إنشاء short link لتقصير الرابط
  let publicUrl = reviewUrl;
  try {
    publicUrl = await createShortLink(reviewUrl, storeUid);
    console.log(`[INVITE FLOW] 12.1. Short link created: ${publicUrl}`);
  } catch (shortLinkErr) {
    console.log(`[INVITE FLOW] 12.1. Short link failed, using full URL: ${shortLinkErr}`);
    publicUrl = reviewUrl;
  }
  
  console.log(`[INVITE FLOW] 12. Generated tokenId: ${tokenId}`);
  console.log(`[INVITE FLOW] 13. Review URL (short): ${publicUrl}`);

  await db.collection("review_tokens").doc(tokenId).set({
    id: tokenId, platform: "salla", orderId, storeUid,
    productId: mainProductId, productIds,
    createdAt: Date.now(), usedAt: null,
    publicUrl, targetUrl: reviewUrl, channel: "multi",
  });

  await db.collection("review_invites").doc(tokenId).set({
    tokenId, orderId, platform: "salla", storeUid,
    productId: mainProductId, productIds,
    customer: { name: finalCustomer?.name ?? null, email: customerEmail || null, mobile: finalCustomer?.mobile ?? null },
    sentAt: Date.now(), deliveredAt: null, clicks: 0, publicUrl,
  });

  // ——— إرسال فوري عبر الـ sender القديم بتاعك
  const storeName = getStoreOrMerchantName(rawData) ?? "متجرك";
  if (LOG_REVIEW_URLS === "1" || LOG_REVIEW_URLS === "true") {
    console.log(`[REVIEW_LINK] orderId=${orderId} tokenId=${tokenId} url=${publicUrl}`);
    await db.collection("webhook_firebase").add({ at: Date.now(), level: "info", scope: "review", msg: "review link", orderId, tokenId, url: publicUrl }).catch(()=>{});
  }
  console.log(`[INVITE FLOW] 14. Sending invitations...`);
  try {
  await sendBothNow({
    inviteId: tokenId,
      phone: finalCustomer?.mobile,
      email: customerEmail,
      customerName: finalCustomer?.name,
    storeName,
      productName: mainProductName, // ✅ اسم المنتج
      orderNumber: String(order.number || orderId), // ✅ رقم الطلب
    url: publicUrl,
    perChannelTimeoutMs: 15000,
  });
    console.log(`[INVITE FLOW] 15. ✅ Invitations sent successfully`);
  } catch (sendError) {
    console.log(`[INVITE FLOW] 15. ⚠️ Send failed but token created: ${sendError}`);
  }

  if (storeUid) {
    try {
      await onInviteSent(storeUid);
      console.log(`[INVITE FLOW] 16. ✅ Usage counter updated for ${storeUid}`);
    } catch (usageError) {
      console.log(`[INVITE FLOW] 16. ⚠️ Usage update failed: ${usageError}`);
    }
  }
  
  console.log(`[INVITE FLOW] 🎉 COMPLETED: Review token ${tokenId} created for order ${orderId}`);
}

/* ===================== Handler ===================== */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const raw = await readRawBody(req);
  const db = dbAdmin();

  // (1) Security check + basic log row
  const verification = verifySallaRequest(req, raw);
  
  // DEVELOPMENT BYPASS: Skip auth in localhost for testing
  const isDevelopment = process.env.NODE_ENV === "development" || req.headers.host?.includes("localhost");
  // PRODUCTION BYPASS: Allow missing auth in production for Salla webhooks (temporary)
  const isProduction = process.env.NODE_ENV === "production" || req.headers.host?.includes("vercel");
  const authBypass = (isDevelopment && (!WEBHOOK_SECRET && !WEBHOOK_TOKEN)) || 
                    (isProduction && (!WEBHOOK_SECRET && !WEBHOOK_TOKEN));
  
  await fbLog(db, {
    level: (verification.ok || authBypass) ? "info" : "warn",
    scope: "auth",
    msg: (verification.ok || authBypass) ? "verification ok" : "verification failed",
    event: null, idemKey: null, merchant: null, orderId: null,
    meta: {
      strategyHeader: getHeader(req, "x-salla-security-strategy") || "auto",
      hasSecret: !!WEBHOOK_SECRET, hasToken: !!WEBHOOK_TOKEN,
      sigLen: (getHeader(req, "x-salla-signature") || "").length,
      from: req.headers["x-forwarded-for"] || req.socket.remoteAddress,
      isDevelopment,
      isProduction,
      authBypass,
      nodeEnv: process.env.NODE_ENV,
      host: req.headers.host
    }
  });
  
  if (!verification.ok && !authBypass) return res.status(401).json({ error: "unauthorized" });

  // (2) Proceed synchronously (no early ACK). Vercel Node runtime may stop work after responding.

  // (3) Parse body
  let body: SallaWebhookBody = { event: "" };
  try {
    body = JSON.parse(raw.toString("utf8") || "{}");
    
    // TEMPORARY DEBUG - Remove after fixing
    console.log('🔍 [SALLA DEBUG]', {
      event: body.event,
      merchant: body.merchant,
      hasData: !!body.data,
      dataKeys: body.data ? Object.keys(body.data) : Object.keys(body),
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    await fbLog(db, { level: "error", scope: "parse", msg: "invalid json", event: null, idemKey: null, merchant: null, orderId: null,
      meta: { err: e instanceof Error ? e.message : String(e), rawFirst2000: raw.toString("utf8").slice(0, 2000) } });
    await db.collection("webhook_errors").add({
      at: Date.now(), scope: "parse", error: e instanceof Error ? e.message : String(e),
      raw: raw.toString("utf8").slice(0, 2000), headers: req.headers
    }).catch(() => {});
    return;
  }

  const event = String(body.event || "");
  const dataRaw = (body.data ?? {}) as Dict;
  const asOrder = dataRaw as SallaOrder;

  const orderId = (() => {
    const v = asOrder?.id ?? asOrder?.order_id;
    return v == null ? null : String(v);
  })();

  const merchantIdRaw =
    body.merchant ??
    (dataRaw["merchant_id"] as unknown) ??
    (dataRaw["merchant"] && typeof dataRaw["merchant"] === "object" ? (dataRaw["merchant"] as Dict)["id"] : undefined);

  const merchantId: string | number | null =
    typeof merchantIdRaw === "number" ? merchantIdRaw :
    typeof merchantIdRaw === "string" ? merchantIdRaw :
    null;

  // (4) Idempotency
  const sigHeader = getHeader(req, "x-salla-signature") || "";
  const idemKey = crypto.createHash("sha256").update(sigHeader + "|").update(raw).digest("hex");
  const idemRef = db.collection("webhooks_salla").doc(idemKey);

  try {
    const ex = await idemRef.get();
    if (ex.exists) {
      await fbLog(db, { level: "info", scope: "idempotency", msg: "duplicate detected; skip", event, idemKey, merchant: merchantId, orderId });
      await idemRef.set({ statusFlag: "duplicate", lastSeenAt: Date.now() }, { merge: true });
      return;
    }
    await idemRef.set({
      at: Date.now(), event, orderId,
      status: lc(asOrder.status ?? asOrder.order_status ?? asOrder.new_status ?? asOrder.shipment_status ?? ""),
      paymentStatus: lc(asOrder.payment_status ?? ""),
      merchant: merchantId, strategy: verification.strategy,
      statusFlag: "processing", processingStartedAt: Date.now()
    }, { merge: true });
    await fbLog(db, { level: "debug", scope: "idempotency", msg: "idem stored", event, idemKey, merchant: merchantId, orderId });
  } catch (e) {
    await fbLog(db, { level: "warn", scope: "idempotency", msg: "idem set failed (continue)", event, idemKey, merchant: merchantId, orderId, meta: { err: String(e) } });
  }

  // (5) Main processing
  try {
    await fbLog(db, { level: "info", scope: "handler", msg: "processing start", event, idemKey, merchant: merchantId, orderId });
    
    // Early debug logging
    console.log(`[SALLA PROCESSING] Starting - Event: ${event}, OrderId: ${orderId}` + (merchantId ? `, MerchantId: ${merchantId}` : ''));
    console.log(`[SALLA PROCESSING] Data keys: ${Object.keys(dataRaw as Record<string, unknown>).join(', ')}`);
    console.log(`[SALLA PROCESSING] Customer exists: ${!!(dataRaw as Record<string, unknown>).customer}`);
    console.log(`[SALLA PROCESSING] Items exist: ${!!(dataRaw as Record<string, unknown>).items}`);

    // Auto-save domain for ANY incoming event if payload includes store.domain or merchant.domain
    try {
      const storeUidFromEvent = pickStoreUidFromSalla(dataRaw, body.merchant);
      console.log(`[AUTO-DOMAIN] Full payload inspection:`, JSON.stringify(dataRaw, null, 2));
      
      const payloadDomainGeneric =
        (typeof (dataRaw["store"] as Dict | undefined)?.["domain"] === "string" ? ((dataRaw["store"] as Dict)["domain"] as string) : undefined) ??
        (typeof (dataRaw["merchant"] as Dict | undefined)?.["domain"] === "string" ? ((dataRaw["merchant"] as Dict)["domain"] as string) : undefined) ??
        (typeof dataRaw["domain"] === "string" ? (dataRaw["domain"] as string) : undefined) ??
        (typeof dataRaw["store_url"] === "string" ? (dataRaw["store_url"] as string) : undefined) ??
        (typeof dataRaw["url"] === "string" ? (dataRaw["url"] as string) : undefined);

      const baseGeneric = toDomainBase(payloadDomainGeneric);
      console.log(`[AUTO-DOMAIN] Event: ${event}, StoreUid: ${storeUidFromEvent}, Domain: ${payloadDomainGeneric}, Base: ${baseGeneric}`);
      
      // FORCE SAVE if we have storeUidFromEvent but no domain - try to fetch it
      if (storeUidFromEvent && !baseGeneric && merchantId) {
        console.log(`[AUTO-DOMAIN] No domain in payload, attempting to fetch store info for merchant ${merchantId}`);
        try {
          const storeInfoUrl = `https://api.salla.dev/admin/v2/store`;
          const response = await fetch(storeInfoUrl, {
            headers: {
              'Authorization': 'Bearer ' + (process.env.SALLA_APP_TOKEN || 'dummy'),
              'Content-Type': 'application/json'
            }
          });
          
          if (response.ok) {
            const storeInfo = await response.json();
            const fetchedDomain = storeInfo?.data?.domain || storeInfo?.domain;
            if (fetchedDomain) {
              console.log(`[AUTO-DOMAIN] Fetched domain from API: ${fetchedDomain}`);
              await saveDomainAndFlags(db, storeUidFromEvent, merchantId, fetchedDomain, event);
              await saveMultipleDomainFormats(db, storeUidFromEvent, fetchedDomain);
              await fbLog(db, { level: "info", scope: "domain", msg: "fetched and saved domain from store API", event, idemKey, merchant: merchantId, orderId, meta: { domain: fetchedDomain, storeUid: storeUidFromEvent } });
              return; // Exit early after successful fetch
            }
          }
        } catch (fetchErr) {
          console.log(`[AUTO-DOMAIN] Failed to fetch store info: ${fetchErr}`);
        }
      }

      if (storeUidFromEvent && baseGeneric) {
        const keyGeneric = encodeUrlForFirestore(baseGeneric);
        const existsGeneric = await db.collection("domains").doc(keyGeneric).get().then(d => d.exists).catch(() => false);
        console.log(`[AUTO-DOMAIN] Domain key "${keyGeneric}" exists: ${existsGeneric}`);
        if (!existsGeneric) {
          console.log(`[AUTO-DOMAIN] Saving new domain for ${storeUidFromEvent}: ${baseGeneric}`);
          await saveDomainAndFlags(db, storeUidFromEvent, merchantId, baseGeneric, event);
          await saveMultipleDomainFormats(db, storeUidFromEvent, payloadDomainGeneric);
          await fbLog(db, { level: "info", scope: "domain", msg: "auto-saved domain from event payload", event, idemKey, merchant: merchantId, orderId, meta: { base: baseGeneric, storeUid: storeUidFromEvent } });
        } else {
          console.log(`[AUTO-DOMAIN] Domain already exists, skipping save`);
        }
      } else {
        console.log(`[AUTO-DOMAIN] Skipping - missing storeUid (${!!storeUidFromEvent}) or base (${!!baseGeneric})`);
        console.log(`[AUTO-DOMAIN] Available keys in payload:`, Object.keys(dataRaw as Record<string, unknown>));
      }
    } catch (e) {
      await fbLog(db, { level: "warn", scope: "domain", msg: "auto-save domain failed", event, idemKey, merchant: merchantId, orderId, meta: { err: e instanceof Error ? e.message : String(e) } });
    }

    // A) authorize/installed/updated → flags/domain + oauth + store/info + userinfo + password email
    console.log(`[SALLA STEP] A) Checking install/auth events for: ${event}`);
    if (event === "app.store.authorize" || event === "app.updated" || event === "app.installed") {
      const storeUid = merchantId != null ? `salla:${String(merchantId)}` : undefined;

      // access_token من البودي (إن وُجد)
      const tokenFromPayload =
        (typeof (dataRaw["access_token"]) === "string" && (dataRaw["access_token"] as string).trim())
          ? (dataRaw["access_token"] as string).trim()
          : (typeof (dataRaw["token"]) === "object" && dataRaw["token"] && typeof (dataRaw["token"] as Dict)["access_token"] === "string"
              ? ((dataRaw["token"] as Dict)["access_token"] as string).trim()
              : "");

      // دومين من البودي (إن وُجد)
      const domainInPayload =
        (typeof dataRaw["domain"] === "string" ? (dataRaw["domain"] as string) : undefined) ??
        (typeof dataRaw["store_url"] === "string" ? (dataRaw["store_url"] as string) : undefined) ??
        (typeof dataRaw["url"] === "string" ? (dataRaw["url"] as string) : undefined) ??
        (typeof (dataRaw["store"] as Dict | undefined)?.["domain"] === "string" ? ((dataRaw["store"] as Dict)["domain"] as string) : undefined) ??
        (typeof (dataRaw["merchant"] as Dict | undefined)?.["domain"] === "string" ? ((dataRaw["merchant"] as Dict)["domain"] as string) : undefined);

      let base = toDomainBase(domainInPayload);

      if (storeUid) {
        console.log(`[DOMAIN SAVE] Saving domain for ${storeUid}: base="${base}", original="${domainInPayload}"`);
        await saveDomainAndFlags(db, storeUid, merchantId, base, event);
        // Also save multiple domain formats for better resolution
        await saveMultipleDomainFormats(db, storeUid, domainInPayload);
        console.log(`[DOMAIN SAVE] Domain saving completed for ${storeUid}`);
      }

      // خزّن OAuth لو متاح
      const refresh =
        typeof dataRaw["refresh_token"] === "string" ? (dataRaw["refresh_token"] as string) :
        (typeof (dataRaw["token"] as Dict | undefined)?.["refresh_token"] === "string"
          ? ((dataRaw["token"] as Dict)["refresh_token"] as string) : "");

      const expiresNumRaw = (dataRaw["expires"] as unknown) ?? (dataRaw["token"] as Dict | undefined)?.["expires"];
      const expires = typeof expiresNumRaw === "number" ? expiresNumRaw : Number(expiresNumRaw ?? 0);

      const scopeStr =
        typeof dataRaw["scope"] === "string" ? (dataRaw["scope"] as string) :
        (typeof (dataRaw["token"] as Dict | undefined)?.["scope"] === "string"
          ? ((dataRaw["token"] as Dict)["scope"] as string) : "");

      if (storeUid && tokenFromPayload) {
        await db.collection("owners").doc(storeUid).set({
          uid: storeUid, provider: "salla",
          oauth: {
            access_token: tokenFromPayload,
            refresh_token: refresh || null,
            scope: scopeStr || null,
            expires: Number.isFinite(expires) ? expires : null,
            receivedAt: Date.now(),
            strategy: "easy_mode",
          },
          updatedAt: Date.now(),
        }, { merge: true });
        await fbLog(db, { level: "info", scope: "oauth", msg: "owner oauth saved", event, idemKey, merchant: merchantId, orderId, meta: { storeUid, hasRefresh: !!refresh } });
      }

      // لو base مش معروف → حاول store/info
      if (storeUid && !base) {
        const token = tokenFromPayload || (await getOwnerAccessToken(db, storeUid)) || "";
        if (token) {
          try {
            const info = await fetchStoreInfo(token);
            const d = info?.data?.domain && typeof info.data.domain === "string" ? info.data.domain : null;
            const resolvedBase = toDomainBase(d);
            if (resolvedBase) {
              base = resolvedBase;
              await saveDomainAndFlags(db, storeUid, merchantId, base, event);
              // Also save multiple domain formats
              await saveMultipleDomainFormats(db, storeUid, d);
              await fbLog(db, { level: "info", scope: "domain", msg: " multiple domain formats saved from store/info", event, idemKey, merchant: merchantId, orderId, meta: { base } });
            } else {
              await fbLog(db, { level: "warn", scope: "domain", msg: "store/info returned no usable domain", event, idemKey, merchant: merchantId, orderId, meta: { rawDomain: d } });
            }
          } catch (e) {
            await fbLog(db, { level: "warn", scope: "domain", msg: "store/info fetch failed", event, idemKey, merchant: merchantId, orderId, meta: { err: e instanceof Error ? e.message : String(e) } });
          }
        } else {
          await fbLog(db, { level: "warn", scope: "domain", msg: "no token available to fetch store/info", event, idemKey, merchant: merchantId, orderId });
        }
      }

      // userinfo + حفظ + إيميل تعيين كلمة المرور + تحسين الدومين لو أمكن
      if (storeUid) {
        const token = tokenFromPayload || (await getOwnerAccessToken(db, storeUid)) || "";
        if (token) {
          try {
            const uinfo = await fetchUserInfo(token);

            await db.collection("stores").doc(storeUid).set({
              uid: storeUid, provider: "salla",
              meta: { userinfo: uinfo, updatedAt: Date.now() },
              updatedAt: Date.now(),
            }, { merge: true });
            await fbLog(db, { level: "info", scope: "userinfo", msg: "userinfo saved", event, idemKey, merchant: merchantId, orderId, meta: { storeUid } });

            const u = uinfo as Dict;
            // Domain extraction from userinfo (not currently used but available for future)
            /* const domainFromInfo =
              (typeof u.merchant === "object" && typeof (u.merchant as Dict)?.domain === "string" ? (u.merchant as Dict).domain as string : undefined) ??
              (typeof u.store === "object" && typeof (u.store as Dict)?.domain === "string" ? (u.store as Dict).domain as string : undefined) ??
              (typeof u.domain === "string" ? u.domain as string : undefined) ??
              (typeof u.url === "string" ? u.url as string : undefined); */

            const infoEmail =
              (typeof u.email === "string" ? u.email as string : undefined) ??
              (typeof u.merchant === "object" && typeof (u.merchant as Dict).email === "string" ? (u.merchant as Dict).email as string : undefined) ??
              (typeof u.user === "object" && typeof (u.user as Dict).email === "string" ? (u.user as Dict).email as string : undefined);

            const storeName =
              (typeof u.merchant === "object" && typeof (u.merchant as Dict).name === "string" ? (u.merchant as Dict).name as string : undefined) ??
              (typeof u.store === "object" && typeof (u.store as Dict).name === "string" ? (u.store as Dict).name as string : undefined) ??
              "متجرك";

            const payloadEmail = typeof (dataRaw as Dict)["email"] === "string" ? ((dataRaw as Dict)["email"] as string) : undefined;
            const targetEmail = infoEmail || payloadEmail;

            if (targetEmail) {
              const r = await sendPasswordSetupEmail({ email: targetEmail, storeUid, storeName });
              if (!r.ok) {
                await fbLog(db, { level: "warn", scope: "password_email", msg: "send failed", event, idemKey, merchant: merchantId, orderId, meta: { storeUid, targetEmail, error: r.error } });
                await db.collection("webhook_errors").add({
                  at: Date.now(), scope: "password_email", event,
                  error: r.error, email: targetEmail, storeUid
                }).catch(() => {});
              } else {
                await fbLog(db, { level: "info", scope: "password_email", msg: "sent ok", event, idemKey, merchant: merchantId, orderId, meta: { storeUid, targetEmail } });
              }
            } else {
              await fbLog(db, { level: "debug", scope: "password_email", msg: "no email found in userinfo/payload", event, idemKey, merchant: merchantId, orderId });
            }
          } catch (e) {
            await fbLog(db, { level: "warn", scope: "userinfo", msg: "userinfo fetch failed", event, idemKey, merchant: merchantId, orderId, meta: { err: e instanceof Error ? e.message : String(e) } });
          }
        } else {
          await fbLog(db, { level: "warn", scope: "userinfo", msg: "no token available to fetch userinfo", event, idemKey, merchant: merchantId, orderId });
        }
      }
    }

    // B) Subscription → set plan
    console.log(`[SALLA STEP] B) Checking subscription events for: ${event}`);
    if (event.startsWith("app.subscription.") || event.startsWith("app.trial.")) {
      // ملاحظة: app.trial.* events قد تأتي من Salla لكن النظام يعالجها كأحداث subscription عادية
      const storeUid = merchantId != null ? `salla:${String(merchantId)}` : undefined;
      const payload = dataRaw as Dict;
      
      // استخراج اسم الباقة من payload (يدعم عدة حقول)
      const planName = 
        String(payload["plan_name"] ?? payload["name"] ?? payload["plan"] ?? "").trim() || 
        (typeof payload["plan"] === "object" ? String((payload["plan"] as Dict)["name"] ?? "").trim() : "");
      const planType = String(payload["plan_type"] ?? payload["type"] ?? "").trim() || null;
      
      // استخدام دالة التعيين الجديدة
      const { mapSallaPlanToInternal } = await import("@/config/plans");
      const planId = mapSallaPlanToInternal(planName, planType);

      if (storeUid && planId) {
        // تحديث subscription في stores collection
        await db.collection("stores").doc(storeUid).set({
          uid: storeUid,
          subscription: { 
            planId, 
            raw: payload, 
            syncedAt: Date.now(),
            updatedAt: Date.now() 
          },
          updatedAt: Date.now(),
        }, { merge: true });
        
        // تحديث plan في نفس document (للتوافق مع النظام القديم)
        await db.collection("stores").doc(storeUid).set({
          plan: {
            code: planId,
            active: true,
            updatedAt: Date.now()
          }
        }, { merge: true });
        
        fbLog(db, { 
          level: "info", 
          scope: "subscription", 
          msg: "plan set from webhook", 
          event, 
          idemKey, 
          merchant: merchantId, 
          orderId, 
          meta: { storeUid, planName, planType, planId } 
        });
      } else {
        const reason = !storeUid ? "missing storeUid" : "invalid plan mapping";
        fbLog(db, { 
          level: "warn", 
          scope: "subscription", 
          msg: `subscription event failed: ${reason}`, 
          event, 
          idemKey, 
          merchant: merchantId, 
          orderId, 
          meta: { planName, planType, planId } 
        });
      }
    }

    // C) Order/Shipment snapshot + Custom updated_order event
    console.log(`[SALLA STEP] C) Checking order/shipment events for: ${event}`);
    if (event.startsWith("order.") || event.startsWith("shipment.") || event === "updated_order") {
      const storeUidFromEvent = pickStoreUidFromSalla(dataRaw, body.merchant) || null;
      
      // Special handling for updated_order event
      if (event === "updated_order") {
        console.log(`[UPDATED_ORDER] Processing order state change for ${orderId}`);
        
        // Extract previous and current states if available
        const dataRecord = dataRaw as Record<string, unknown>;
        const previousState = (dataRecord?.previous_status as string) || (dataRecord?.old_status as string);
        const currentState = asOrder.status || asOrder.order_status || (dataRecord?.new_status as string);
        
        console.log(`[UPDATED_ORDER] State change: ${previousState || 'unknown'} → ${currentState || 'unknown'}`);
        
        // Log the state change
        await fbLog(db, { 
          level: "info", 
          scope: "orders", 
          msg: "order state updated", 
          event, 
          idemKey, 
          merchant: merchantId, 
          orderId, 
          meta: { 
            storeUidFromEvent, 
            previousState, 
            currentState,
            changeDetected: true
          } 
        });
        
        // Save state change history
        try {
          await db.collection("order_state_changes").add({
            orderId,
            storeUid: storeUidFromEvent,
            previousState: previousState || null,
            currentState: currentState || null,
            event,
            merchant: merchantId,
            timestamp: Date.now(),
            webhookData: {
              idemKey,
              rawDataKeys: Object.keys(dataRaw as Record<string, unknown>)
            }
          });
          console.log(`[UPDATED_ORDER] State change recorded for order ${orderId}`);
        } catch (historyErr) {
          console.error(`[UPDATED_ORDER] Failed to record state change:`, historyErr);
        }
      }
      
      try {
      await upsertOrderSnapshot(db, asOrder, storeUidFromEvent);
        fbLog(db, { level: "info", scope: "orders", msg: "order snapshot upserted", event, idemKey, merchant: merchantId, orderId, meta: { storeUidFromEvent } });
      } catch (err) {
        console.error(`[ORDER_SNAPSHOT_ERROR] Failed to upsert order ${orderId}:`, err);
        fbLog(db, { level: "error", scope: "orders", msg: "order snapshot failed", event, idemKey, merchant: merchantId, orderId, meta: { error: (err as Error).message } });
        throw err; // Re-throw to trigger main catch block
      }
    }

    // D) Auto-create review invites on order.updated with status tracking  
    console.log(`[SALLA STEP] D) Checking invite events for: ${event}`);
    if (event === "order.updated" || event === "order.status.updated") {
      // ✅ إرسال الدعوة عند تحديث الطلب - مع تتبع الحالة لتجنب التكرار
      console.log(`[INVITE DEBUG] Order update event detected for order: ${orderId}`);
      
      // ✅ استخراج الـ order الكامل من الـ payload
      const fullOrder = (dataRaw["order"] as SallaOrder | undefined) || asOrder;
      
      // Enhanced invitation creation with fallback mechanisms
      try {
        // Try standard invite creation first
        await Promise.race([
          ensureInviteForOrder(db, fullOrder, dataRaw, body.merchant),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Invite creation timeout')), 20000))
        ]);
        fbLog(db, { level: "info", scope: "invite", msg: "invite auto-created for order", event, idemKey, merchant: merchantId, orderId });
      } catch (primaryErr) {
        console.error(`[INVITE_ERROR] Primary invite creation failed for order ${orderId}:`, primaryErr);
        
        // FALLBACK: Force create review token even with missing data
        try {
          console.log(`[INVITE_FALLBACK] Attempting fallback invite creation for ${orderId}`);
          
          const storeUidFallback = pickStoreUidFromSalla(dataRaw, body.merchant) || `salla:${merchantId}`;
          const tokenId = crypto.randomBytes(10).toString("hex");
          const fallbackBaseUrl = APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://theqah.com";
          const reviewUrl = `${fallbackBaseUrl}/review/${tokenId}`;
          
          // Create minimal review token
          await db.collection("review_tokens").doc(tokenId).set({
            id: tokenId,
            orderId,
            storeUid: storeUidFallback,
            url: reviewUrl,
            customer: {
              name: asOrder.customer?.name || "عميل",
              email: asOrder.customer?.email || null,
              mobile: safeMobile(asOrder.customer?.mobile),
            },
            productIds: extractProductIds(asOrder.items || []),
            createdAt: Date.now(),
            usedAt: null,
            createdVia: "webhook_fallback",
            eventType: event,
            meta: { fallbackCreation: true, originalError: (primaryErr as Error).message }
          }, { merge: true });
          
          console.log(`[INVITE_FALLBACK] ✅ Fallback review token created: ${tokenId}`);
          fbLog(db, { level: "info", scope: "invite", msg: "fallback invite created", event, idemKey, merchant: merchantId, orderId, meta: { tokenId, fallback: true } });
          
        } catch (fallbackErr) {
          console.error(`[INVITE_FALLBACK] ❌ Fallback also failed:`, fallbackErr);
          fbLog(db, { level: "error", scope: "invite", msg: "both primary and fallback invite creation failed", event, idemKey, merchant: merchantId, orderId, meta: { 
            primaryError: (primaryErr as Error).message, 
            fallbackError: (fallbackErr as Error).message 
          }});
        }
      }
    } else if (event === "order.cancelled" || event === "order.refunded") {
      const oid = orderId;
      if (oid) {
        const q = await db.collection("review_tokens").where("orderId","==",oid).get();
        if (!q.empty) {
          const reason = event === "order.cancelled" ? "order_cancelled" : "order_refunded";
          const batch = db.batch(); q.docs.forEach((d)=>batch.update(d.ref, { voidedAt: Date.now(), voidReason: reason }));
          await batch.commit();
          fbLog(db, { level: "info", scope: "invite", msg: "tokens voided", event, idemKey, merchant: merchantId, orderId: oid, meta: { count: q.docs.length, reason } });
        }
      }
    }

    // E) processed + known/unhandled logs
    console.log(`[SALLA STEP] E) Final processing for: ${event}`);
    const orderIdFin = orderId ?? "none";
    const statusFin = lc(asOrder.status ?? asOrder.order_status ?? asOrder.new_status ?? asOrder.shipment_status ?? "");
    Promise.race([
      db.collection("processed_events").doc(keyOf(event, orderIdFin, statusFin)).set({
      at: Date.now(), event, processed: true, status: statusFin
      }, { merge: true }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("processed_events_timeout")), 2000))
    ]).catch(() => {});

    const knownPrefixes = ["order.","shipment.","product.","customer.","category.","brand.","store.","cart.","invoice.","specialoffer.","app."];
    const isKnown = knownPrefixes.some((p)=>event.startsWith(p)) || event === "review.added";
    Promise.race([
      db.collection(isKnown ? "webhooks_salla_known" : "webhooks_salla_unhandled")
        .add({ at: Date.now(), event, data: dataRaw }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("webhooks_salla_timeout")), 2000))
    ]).catch(() => {});

    fbLog(db, { level: "info", scope: "handler", msg: "processing finished ok", event, idemKey, merchant: merchantId, orderId });
    await idemRef.set({ statusFlag: "done", processingFinishedAt: Date.now() }, { merge: true });
    try { res.status(200).json({ ok: true }); } catch {}

  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    
    // Enhanced error logging with stack trace
    console.error(`[SALLA WEBHOOK ERROR] Event: ${event}, OrderId: ${orderId}, Merchant: ${merchantId}`);
    console.error(`[SALLA WEBHOOK ERROR] Error: ${err}`);
    if (stack) console.error(`[SALLA WEBHOOK ERROR] Stack: ${stack}`);
    
    // Development debugging
    if (isDevelopment) {
      console.error(`[SALLA DEBUG] Full error context:`, {
        event, orderId, merchantId,
        hasSecret: !!WEBHOOK_SECRET,
        hasToken: !!WEBHOOK_TOKEN, 
        hasAppBaseUrl: !!APP_BASE_URL,
        nodeEnv: process.env.NODE_ENV,
        host: req.headers.host
      });
    }
    
    fbLog(db, { 
      level: "error", 
      scope: "handler", 
      msg: "processing failed", 
      event, 
      idemKey, 
      merchant: merchantId, 
      orderId, 
      meta: { 
        error: err, 
        stack: stack?.substring(0, 500),
        hasCustomerData: !!((dataRaw as Record<string, unknown>).customer || ((dataRaw as Record<string, unknown>).order as Record<string, unknown>)?.customer),
        hasProductData: !!((dataRaw as Record<string, unknown>).items || ((dataRaw as Record<string, unknown>).order as Record<string, unknown>)?.items),
        dataKeys: Object.keys(dataRaw as Record<string, unknown>)
      } 
    });
    Promise.race([
      db.collection("webhook_errors").add({
        at: Date.now(), scope: "handler", event, orderId: orderId || "unknown", merchantId, 
        error: err, stack: stack?.substring(0, 1000), 
        raw: raw.toString("utf8").slice(0, 2000),
        debugData: {
          hasCustomerData: !!((dataRaw as Record<string, unknown>).customer || ((dataRaw as Record<string, unknown>).order as Record<string, unknown>)?.customer),
          hasProductData: !!((dataRaw as Record<string, unknown>).items || ((dataRaw as Record<string, unknown>).order as Record<string, unknown>)?.items),
          dataKeys: Object.keys(dataRaw as Record<string, unknown>)
        }
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("webhook_errors_timeout")), 3000))
    ]).catch(() => {});
    await idemRef.set({ statusFlag: "failed", lastError: err, processingFinishedAt: Date.now(), errorStack: stack?.substring(0, 500) }, { merge: true });
    try { res.status(500).json({ ok: false, error: err }); } catch {}
  }
}

/* ===================== Logging helper (after handler for hoist clarity) ===================== */
type LogLevel = "debug" | "info" | "warn" | "error";
async function fbLog(
  db: FirebaseFirestore.Firestore,
  entry: {
    level: LogLevel;
    scope: string;
    msg: string;
    event?: string | null;
    idemKey?: string | null;
    merchant?: string | number | null;
    orderId?: string | null;
    meta?: Dict;
  }
) {
  const payload = {
    at: Date.now(),
    level: entry.level,
    scope: entry.scope,
    msg: entry.msg,
    event: entry.event ?? null,
    idemKey: entry.idemKey ?? null,
    merchant: entry.merchant ?? null,
    orderId: entry.orderId ?? null,
    meta: entry.meta ?? null,
  };

  // Always log to console first (non-blocking)
  const lineObj = { event: payload.event, merchant: payload.merchant, orderId: payload.orderId, idemKey: payload.idemKey };
  const line = `[${entry.level.toUpperCase()}][${entry.scope}] ${entry.msg} :: ${JSON.stringify(lineObj)}`;
  if (entry.level === "error" || entry.level === "warn") console.error(line); else console.log(line);

  // Only attempt Firestore logging if explicitly enabled AND not critical path
  if ((WEBHOOK_LOG_DEST === "firestore" || ENABLE_FIRESTORE_LOGS) && entry.level !== "debug") {
    // Fire-and-forget with shorter timeout
    db.collection("webhook_firebase").add(payload)
      .catch(err => {
        console.error("[WEBHOOK_LOG][WRITE_FAIL]", err);
      });
  }
}
