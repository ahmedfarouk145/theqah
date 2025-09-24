import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import { dbAdmin } from "@/lib/firebaseAdmin";
import { createShortLink } from "@/server/short-links";
import { buildInviteSMS, sendSms } from "@/server/messaging/send-sms";
import { sendEmailDmail as sendEmail } from "@/server/messaging/email-dmail";
import { verifySallaWebhook } from "@/server/salla/webhook-verify";

// 🔸 الجديد:
import { canSendInvite } from "@/server/billing/usage";
import { getPlanConfig, type PlanCode } from "@/server/billing/plans";
import { sendMerchantWelcomeEmail } from "@/server/messaging/merchant-welcome";

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
  merchant?: string | number;     // لأحداث app.*
  data?: SallaOrder | UnknownRecord;
}

type SallaAppEvent =
  | "app.store.authorize"
  | "app.installed"
  | "app.updated"
  | "app.uninstalled"
  | "app.trial.started"
  | "app.trial.expired"
  | "app.trial.canceled"
  | "app.subscription.started"
  | "app.subscription.expired"
  | "app.subscription.canceled"
  | "app.subscription.renewed"
  | "app.feedback.created"
  | "app.settings.updated";

// -------------------- Consts & helpers --------------------
const WEBHOOK_TOKEN = (process.env.SALLA_WEBHOOK_TOKEN || "").trim();
const DONE  = new Set(["fulfilled","delivered","completed","complete"]);
const CANCEL= new Set(["canceled","cancelled","refunded","returned"]);
const lc = (x: unknown) => String(x ?? "").toLowerCase();
const keyOf = (event: string, orderId?: string, status?: string) =>
  `salla:${lc(event)}:${orderId ?? "none"}:${status ?? ""}`;

// Helper to safely extract string values from potentially nested objects
function safeStringExtract(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "object" && value !== null) {
    // If it's an object, try to extract common status properties
    const obj = value as Record<string, unknown>;
    // Try common status field names
    const statusValue = obj.status || obj.name || obj.value || obj.state || obj.text || obj.label;
    if (typeof statusValue === "string") return statusValue;
    if (typeof statusValue === "number") return String(statusValue);
    
    // Log when we encounter an object we can't extract from
    console.warn("Unexpected object structure in status field:", JSON.stringify(obj));
  }
  return "";
}

// Helper to extract customer name with fallback logic
function extractCustomerName(customer: unknown): string | null {
  if (!customer || typeof customer !== "object") return null;
  
  const cust = customer as Record<string, unknown>;
  
  // Try different possible name fields
  const nameFields = [
    'name', 'full_name', 'fullName', 'customer_name', 'customerName',
    'first_name', 'firstName', 'display_name', 'displayName'
  ];
  
  for (const field of nameFields) {
    const value = cust[field];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  
  // If no direct name field, try combining first and last name
  const firstName = cust.first_name || cust.firstName;
  const lastName = cust.last_name || cust.lastName;
  if (typeof firstName === "string" && typeof lastName === "string") {
    return `${firstName} ${lastName}`.trim();
  }
  
  return null;
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

// 🔹 helper لاستخراج base من دومين سلة (origin[/dev-xxxx])
function toDomainBase(domain: string | null | undefined): string | null {
  if (!domain) return null;
  try {
    const u = new URL(String(domain));
    const origin = u.origin.toLowerCase();
    const firstSeg = u.pathname.split("/").filter(Boolean)[0] || "";
    return firstSeg && firstSeg.startsWith("dev-") ? `${origin}/${firstSeg}` : origin;
  } catch {
    return null;
  }
}

function encodeUrlForFirestore(url: string | null | undefined): string {
  if (!url) return "";
  // Replace problematic characters with safe alternatives for Firestore document IDs
  return url
    .replace(/:/g, "_COLON_")  // Replace : with _COLON_
    .replace(/\//g, "_SLASH_") // Replace / with _SLASH_
    .replace(/\?/g, "_QUEST_") // Replace ? with _QUEST_
    .replace(/#/g, "_HASH_")   // Replace # with _HASH_
    .replace(/&/g, "_AMP_");   // Replace & with _AMP_
}

// -------------------- Order snapshot & tokens --------------------
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
    status: lc(safeStringExtract(order.status) || safeStringExtract(order.order_status) || safeStringExtract(order.new_status) || safeStringExtract(order.shipment_status) || ""),
    paymentStatus: lc(safeStringExtract(order.payment_status)),
    customer: {
      name: extractCustomerName(order.customer),
      email: order.customer?.email ?? null,
      mobile: order.customer?.mobile ?? null,
    },
    storeUid: storeUid ?? null,
    platform: "salla",
    updatedAt: Date.now(),
  }, { merge: true });
}

async function createInviteTokenAndDoc(
  db: FirebaseFirestore.Firestore,
  order: SallaOrder,
  eventRaw: UnknownRecord
) {
  const orderId = String(order.id ?? order.order_id ?? "");
  if (!orderId) return { inviteId: null as string|null, tokenId: null as string|null, publicUrl: null as string|null, storeUid: null as string|null, productIds: [] as string[] };

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
  const inviteRef = await db.collection("review_invites").add({
    tokenId, orderId, platform: "salla",
    storeUid, productId: mainProductId, productIds,
    customer: { 
      name: extractCustomerName(buyer), 
      email: buyer.email ?? null, 
      mobile: buyer.mobile ?? null 
    },
    sentAt: Date.now(), deliveredAt: null, clicks: 0, publicUrl,
  });

  return { inviteId: inviteRef.id, tokenId, publicUrl, storeUid, productIds };
}

// -------------------- إرسال مباشر (بدون إنكيو) --------------------
async function sendInviteDirectly(
  db: FirebaseFirestore.Firestore,
  order: SallaOrder,
  eventRaw: UnknownRecord
) {
  const orderId = String(order.id ?? order.order_id ?? "");
  if (!orderId) return { sent: false, reason: "missing_order_id" };

  // idempotency على دعوات الطلب
  const exists = await db.collection("review_invites").where("orderId","==",orderId).limit(1).get();
  if (!exists.empty) return { sent: false, reason: "already_invited" };

  // إنشاء التوكن + مستند الدعوة
  const seed = await createInviteTokenAndDoc(db, order, eventRaw);
  if (!seed.inviteId || !seed.storeUid) return { sent: false, reason: "token_create_failed" };

  // التحقق من الباقة قبل الإرسال
  const quota = await canSendInvite(seed.storeUid);
  if (!quota.ok) {
    await db.collection("review_invites").doc(seed.inviteId).set({
      quotaDeniedAt: Date.now(),
      quotaReason: quota.reason,
    }, { merge: true });
    return { sent: false, reason: `quota:${quota.reason}` };
  }

  // تجهيز الرسائل والإرسال المباشر
  const buyer = order.customer ?? {};
  const storeName = getStoreOrMerchantName(eventRaw) ?? "متجرك";
  const name = extractCustomerName(buyer) || "عميلنا العزيز";
  const smsText = buildInviteSMS(storeName, seed.publicUrl!);
  const emailHtml = `
    <div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.7">
      <p>مرحباً ${name},</p>
      <p>قيّم تجربتك من <strong>${storeName}</strong>.</p>
      <p><a href="${seed.publicUrl}" style="background:#16a34a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">اضغط للتقييم الآن</a></p>
      <p style="color:#64748b">فريق ثقة</p>
    </div>
  `;

  // إرسال الرسائل مباشرة
  const tasks: Array<Promise<unknown>> = [];
  if (buyer.mobile) {
    const mobile = String(buyer.mobile).replace(/\s+/g, "");
    tasks.push(sendSms(mobile, smsText));
  }
  if (buyer.email) {
    tasks.push(sendEmail(buyer.email, "قيّم تجربتك معنا", emailHtml));
  }

  if (!tasks.length) return { sent: false, reason: "no_channels" };

  // تنفيذ الإرسال
  await Promise.allSettled(tasks);

  return { sent: true, inviteId: seed.inviteId, channels: tasks.length };
}

async function voidInvitesForOrder(db: FirebaseFirestore.Firestore, orderId: string, reason: string) {
  if (!orderId) return;
  const q = await db.collection("review_tokens").where("orderId","==",orderId).get();
  const batch = db.batch();
  q.docs.forEach((d) => batch.update(d.ref, { voidedAt: Date.now(), voidReason: reason }));
  await batch.commit();
}

// -------------------- Billing/Usage من أحداث سِلّة --------------------
async function handleAppEvent(
  db: FirebaseFirestore.Firestore,
  event: SallaAppEvent,
  merchant: string | number | undefined,
  data: UnknownRecord
) {
  const uid = merchant != null ? `salla:${String(merchant)}` : "salla:unknown";

  await db.collection("salla_app_events").add({ uid, event, merchant: merchant ?? null, data, at: Date.now() });

  // OAuth & تخزين التوكن + الدومين كما هو عندك (مختصر)
  if (event === "app.store.authorize") {
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
    const access_token  = String((data as any)?.access_token || "");
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
    const refresh_token = ((data as any)?.refresh_token as string) || null;
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
    const expires       = Number((data as any)?.expires || 0);
    const expiresAt     = expires ? Date.now() + expires * 1000 : null;

    if (access_token) {
      await db.collection("salla_tokens").doc(uid).set({
        uid, provider: "salla", storeId: merchant ?? null,
        accessToken: access_token, refreshToken: refresh_token,
        expiresIn: expires || null, expiresAt,
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
        scope: (data as any)?.scope || null,
        obtainedAt: Date.now(),
      }, { merge: true });
    }

    // 🆕 جلب معلومات المتجر والتاجر (متطلبات سلة - Get user information)
    let domain: string | null = null;
    let storeName: string | null = null;
    let merchantEmail: string | null = null;
    
    try {
      // جلب معلومات المتجر
      const storeResp = await fetch("https://api.salla.dev/admin/v2/store/info", {
        headers: { Authorization: `Bearer ${access_token}` }
      });
      if (storeResp.ok) {
        const storeInfo = await storeResp.json();
        domain = storeInfo.data?.domain || storeInfo.data?.url || null;
        storeName = storeInfo.data?.name || null;
        
        if (domain) {
          await db.collection("stores").doc(uid).set({ "salla.domain": domain }, { merge: true });
          const base = toDomainBase(domain);
          if (base) {
            const encodedBase = encodeUrlForFirestore(base);
            await db.collection("domains").doc(encodedBase).set({ storeUid: uid, updatedAt: Date.now() }, { merge: true });
          }
        }
      }

      // 🆕 جلب معلومات التاجر (صاحب المتجر)
      try {
        const userResp = await fetch("https://api.salla.dev/admin/v2/user/info", {
          headers: { Authorization: `Bearer ${access_token}` }
        });
        if (userResp.ok) {
          const userInfo = await userResp.json();
          merchantEmail = userInfo.data?.email || null;
          
          // حفظ معلومات التاجر
          if (merchantEmail) {
            await db.collection("stores").doc(uid).set({
              "salla.merchantEmail": merchantEmail,
              "salla.merchantName": userInfo.data?.name || null,
            }, { merge: true });
          }
        }
      } catch (userFetchError) {
        console.warn('فشل في جلب معلومات التاجر:', userFetchError);
      }
    } catch (fetchError) {
      console.warn('فشل في جلب معلومات المتجر:', fetchError);
    }

    await db.collection("stores").doc(uid).set({
      uid, platform: "salla",
      "salla.storeId": merchant ?? null,
      "salla.connected": true,
      "salla.installed": true,
      "salla.domain": domain,
      "salla.storeName": storeName,
      "salla.installedAt": Date.now(),
      updatedAt: Date.now(),
    }, { merge: true });

    // 🆕 إرسال إيميل ترحيب للتاجر (متطلبات سلة - Easy mode)
    if (merchantEmail && storeName && merchant) {
      try {
        console.log(`محاولة إرسال إيميل ترحيب للتاجر: ${merchantEmail} للمتجر: ${storeName} (${merchant})`);
        
        await sendMerchantWelcomeEmail({
          merchantEmail,
          storeName,
          storeId: merchant,
          domain: domain || undefined,
          accessToken: access_token,
        });
        
        console.log(`✅ تم إرسال إيميل الترحيب بنجاح للتاجر: ${merchantEmail}`);
        
        // حفظ معلومات إرسال الإيميل في قاعدة البيانات للمراجعة
        await db.collection("merchant_welcome_emails").add({
          merchantEmail,
          storeName,
          storeId: merchant,
          uid,
          domain,
          sentAt: Date.now(),
          status: "sent",
        });
        
      } catch (emailError) {
        console.error('❌ فشل في إرسال إيميل الترحيب:', {
          error: emailError,
          merchantEmail,
          storeName,
          storeId: merchant,
          uid,
          domain,
          timestamp: new Date().toISOString()
        });
        
        // حفظ معلومات فشل إرسال الإيميل للمراجعة
        await db.collection("merchant_welcome_emails").add({
          merchantEmail,
          storeName,
          storeId: merchant,
          uid,
          domain,
          sentAt: Date.now(),
          status: "failed",
          error: emailError instanceof Error ? emailError.message : String(emailError),
        });
        
        // لا نوقف العملية حتى لو فشل الإيميل
      }
    } else {
      console.warn('⚠️ لم يتم إرسال إيميل الترحيب - معلومات ناقصة:', {
        merchantEmail: !!merchantEmail,
        storeName: !!storeName,
        merchant: !!merchant,
        uid,
        domain
      });
    }
  }

  // حالة التثبيت/الإزالة
  if (event === "app.installed") {
    await db.collection("stores").doc(uid).set({
      uid, platform: "salla",
      "salla.storeId": merchant ?? null,
      "salla.installed": true,
      "salla.installedAt": Date.now(),
      updatedAt: Date.now(),
    }, { merge: true });
  }
  if (event === "app.uninstalled") {
    await db.collection("stores").doc(uid).set({
      uid, platform: "salla",
      "salla.storeId": merchant ?? null,
      "salla.installed": false,
      "salla.connected": false,
      "salla.uninstalledAt": Date.now(),
      updatedAt: Date.now(),
    }, { merge: true });

    // إزالة فهرس الدومين المرتبط
    const doc = await db.collection("stores").doc(uid).get();
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = doc.data() as any;
    const base = toDomainBase(d?.salla?.domain || null);
    if (base) {
      const encodedBase = encodeUrlForFirestore(base);
      await db.collection("domains").doc(encodedBase).delete().catch(()=>{});
    }
  }

  // 🔸 الباقات والاستهلاك
  if (event === "app.trial.started") {
    await db.collection("stores").doc(uid).set({
      plan: { code: "TRIAL", active: true },
      usage: { invitesUsed: 0 },
      updatedAt: Date.now(),
    }, { merge: true });
  }
  if (event === "app.trial.expired" || event === "app.trial.canceled") {
    await db.collection("stores").doc(uid).set({
      "plan.active": false, updatedAt: Date.now(),
    }, { merge: true });
  }
  if (event === "app.subscription.started" || event === "app.subscription.renewed") {
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
    const code = String(((data as any)?.plan_code || (data as any)?.plan || "P30")).toUpperCase() as PlanCode;
    const cfg = getPlanConfig(code);
    await db.collection("stores").doc(uid).set({
      plan: { code: cfg.code, active: true },
      usage: { invitesUsed: 0 }, // reset عند التجديد/البدء
      updatedAt: Date.now(),
    }, { merge: true });
  }
  if (event === "app.subscription.expired" || event === "app.subscription.canceled") {
    await db.collection("stores").doc(uid).set({
      "plan.active": false, updatedAt: Date.now(),
    }, { merge: true });
  }

  if (event === "app.settings.updated") {
    await db.collection("stores").doc(uid).set({
      //eslint-disable-next-line @typescript-eslint/no-explicit-any
      "salla.settings": (data as any)?.settings ?? {},
      updatedAt: Date.now(),
    }, { merge: true });
  }

  if (event === "app.feedback.created") {
    await db.collection("stores").doc(uid).collection("app_feedback").add({ at: Date.now(), data });
  }
}

// -------------------- Handler --------------------
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const raw = await readRawBody(req);
  
  // ✅ Enhanced authentication supporting both token and signature verification
  let isAuthenticated = false;
  
  // Method 1: Signature-based verification (preferred by Salla)
  const sallaSignature = getHeader(req, "x-salla-signature");
  if (sallaSignature) {
    isAuthenticated = verifySallaWebhook(raw, sallaSignature);
    if (!isAuthenticated) {
      console.warn("Salla webhook signature verification failed", {
        hasSignature: !!sallaSignature,
        hasSecret: !!process.env.SALLA_WEBHOOK_SECRET,
        timestamp: Date.now()
      });
    }
  }
  
  // Method 2: Token-based verification (fallback)
  if (!isAuthenticated) {
    const provided = extractProvidedToken(req);
    if (WEBHOOK_TOKEN && provided && timingSafeEq(provided, WEBHOOK_TOKEN)) {
      isAuthenticated = true;
    } else if (provided) {
      console.warn("Webhook token verification failed", {
        hasToken: !!WEBHOOK_TOKEN,
        hasProvided: !!provided,
        timestamp: Date.now()
      });
    }
  }
  
  // Method 3: Development/testing fallback - allow requests when no authentication is configured
  if (!isAuthenticated) {
    const hasNoAuthConfigured = !process.env.SALLA_WEBHOOK_SECRET && !WEBHOOK_TOKEN;
    const isDevelopment = process.env.NODE_ENV !== 'production';
    
    if (hasNoAuthConfigured || (isDevelopment && process.env.SKIP_WEBHOOK_AUTH === 'true')) {
      console.warn("Webhook authentication bypassed", {
        reason: hasNoAuthConfigured ? "no_auth_configured" : "development_skip",
        hasWebhookSecret: !!process.env.SALLA_WEBHOOK_SECRET,
        hasWebhookToken: !!WEBHOOK_TOKEN,
        isDevelopment,
        skipAuth: process.env.SKIP_WEBHOOK_AUTH === 'true',
        timestamp: Date.now()
      });
      isAuthenticated = true;
    }
  }
  
  if (!isAuthenticated) {
    console.error("Webhook authentication failed - neither signature nor token verification succeeded", {
      hasSallaSignature: !!sallaSignature,
      hasProvidedToken: !!extractProvidedToken(req),
      hasWebhookSecret: !!process.env.SALLA_WEBHOOK_SECRET,
      hasWebhookToken: !!WEBHOOK_TOKEN,
      timestamp: Date.now()
    });
    return res.status(401).json({ error: "authentication_failed" });
  }

  const db = dbAdmin();

  let body: SallaWebhookBody = { event: "" };
  try {
    body = JSON.parse(raw.toString("utf8") || "{}") as SallaWebhookBody;
  } catch (parseError) {
    console.error("Failed to parse webhook JSON:", {
      error: parseError instanceof Error ? parseError.message : String(parseError),
      rawLength: raw.length,
      timestamp: Date.now()
    });
    return res.status(400).json({ error: "invalid_json" });
  }

  const event = String(body.event || "");
  const dataRaw = (body.data ?? {}) as UnknownRecord;
  const asOrder = dataRaw as SallaOrder;

  // Log webhook processing for debugging
  console.log("Processing Salla webhook:", {
    event,
    orderId: String(asOrder.id ?? asOrder.order_id ?? "") || null,
    hasCustomer: !!asOrder.customer,
    customerEmail: asOrder.customer?.email || null,
    timestamp: Date.now()
  });

  // Idempotency (قبل أي عمل ثقيل)
  const providedToken = extractProvidedToken(req);
  const idemKey = crypto.createHash("sha256").update((providedToken || sallaSignature || "") + "|").update(raw).digest("hex");
  const idemRef = db.collection("webhooks_salla").doc(idemKey);
  if ((await idemRef.get()).exists) return res.status(200).json({ ok: true, deduped: true });
  await idemRef.set({
    at: Date.now(),
    event,
    orderId: String(asOrder.id ?? asOrder.order_id ?? "") || null,
    status: lc(safeStringExtract(asOrder.status) || safeStringExtract(asOrder.order_status) || safeStringExtract(asOrder.new_status) || safeStringExtract(asOrder.shipment_status) || ""),
    paymentStatus: lc(safeStringExtract(asOrder.payment_status)),
    merchant: body.merchant ?? null,
  });

  // app.* (OAuth + Plans)
  if (event.startsWith("app.")) {
    await handleAppEvent(db, event as SallaAppEvent, body.merchant, dataRaw);
    await db.collection("processed_events").doc(keyOf(event)).set({ at: Date.now(), event, processed: true }, { merge: true });
    return res.status(200).json({ ok: true });
  }

  // أوامر الطلبات / الشحن
  const orderId = String(asOrder.id ?? asOrder.order_id ?? "");
  const status = lc(safeStringExtract(asOrder.status) || safeStringExtract(asOrder.order_status) || safeStringExtract(asOrder.new_status) || safeStringExtract(asOrder.shipment_status) || "");
  const paymentStatus = lc(safeStringExtract(asOrder.payment_status));
  const storeUidFromEvent = pickStoreUidFromSalla(dataRaw) || null;

  await upsertOrderSnapshot(db, asOrder, storeUidFromEvent);

  // 🔸 Fast-ACK + إرسال مباشر (بدون إنكيو)
  let shouldSend = false;
  // إرسال الرسائل فقط عند اكتمال الطلب، ليس عند الدفع
  if (event === "shipment.updated") {
    if (DONE.has(status) || ["delivered","completed"].includes(status)) shouldSend = true;
  } else if (event === "order.status.updated") {
    if (DONE.has(status)) shouldSend = true;
  } else if (event === "order.cancelled") {
    await voidInvitesForOrder(db, orderId, "order_cancelled");
  } else if (event === "order.refunded") {
    await voidInvitesForOrder(db, orderId, "order_refunded");
  }

  // ✅ ACK سريع دائمًا
  res.status(202).json({ ok: true, accepted: true, event });

  // 🧵 نفّذ الإرسال المباشر بعد الرد
  try {
    if (shouldSend) {
      await sendInviteDirectly(db, asOrder, dataRaw);
    }
  } catch (e) {
    // لو فشل الإرسال نسجله للمتابعة
    await db.collection("webhook_errors").add({
      at: Date.now(), scope: "sendInviteDirectly", event, orderId, error: e instanceof Error ? e.message : String(e),
    }).catch(()=>{});
  }
}
