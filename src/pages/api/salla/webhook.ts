import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import { dbAdmin } from "@/lib/firebaseAdmin";
import { createShortLink } from "@/server/short-links";
import { buildInviteSMS, sendSms } from "@/server/messaging/send-sms";
import { sendEmailDmail as sendEmail } from "@/server/messaging/email-dmail";

// 🔸 Billing/Plans
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
  status?: string | { name?: string; slug?: string } | UnknownRecord;
  order_status?: string | { name?: string; slug?: string } | UnknownRecord;
  new_status?: string | { name?: string; slug?: string } | UnknownRecord;
  shipment_status?: string | { name?: string; slug?: string } | UnknownRecord;
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
const lc = (x: unknown) => String(x ?? "").toLowerCase();
const keyOf = (event: string, orderId?: string, status?: string) =>
  `salla:${lc(event)}:${orderId ?? "none"}:${status ?? ""}`;

function safeStringExtract(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    const statusValue =
      (obj as Record<string, unknown>).slug ||
      obj.status ||
      obj.name ||
      obj.value ||
      obj.state ||
      obj.text ||
      obj.label;
    if (typeof statusValue === "string") return statusValue;
    if (typeof statusValue === "number") return String(statusValue);
  }
  return "";
}

// ✅ تطبيع الحالة إلى slug موحّد
function normalizeStatus(input: unknown): { raw: string; slug: string } {
  const raw = lc(safeStringExtract(input));
  const known = new Set([
    "payment_pending","under_review","in_progress","completed",
    "delivering","delivered","shipped","canceled",
    "restored","restoring","fulfilled","complete"
  ]);
  if (known.has(raw)) return { raw, slug: raw };

  const arMap: Record<string,string> = {
    "بإنتظار الدفع":"payment_pending",
    "في انتظار الدفع":"payment_pending",
    "بإنتظار المراجعة":"under_review",
    "جاري مراجعة طلبك":"under_review",
    "قيد التنفيذ":"in_progress",
    "تم التنفيذ":"completed",
    "جاري التوصيل":"delivering",
    "تم التوصيل":"delivered",
    "تم الشحن":"shipped",
    "ملغي":"canceled",
    "مسترجع":"restored",
    "قيد الإسترجاع":"restoring",
    "مكتمل":"completed",
    "اكتمل":"completed",
  };
  const norm = raw.replace(/\s+/g,"").replace(/[إأآ]/g,"ا").replace(/ى/g,"ي").replace(/ؤ|ئ/g,"ء");
  for (const [k,v] of Object.entries(arMap)) {
    const kk = k.toLowerCase().replace(/\s+/g,"").replace(/[إأآ]/g,"ا").replace(/ى/g,"ي").replace(/ؤ|ئ/g,"ء");
    if (norm === kk) return { raw, slug: v };
  }
  if (raw.includes("delivered")) return { raw, slug: "delivered" };
  if (raw.includes("delivering")) return { raw, slug: "delivering" };
  if (raw.includes("shipped")) return { raw, slug: "shipped" };
  if (raw.includes("complete")) return { raw, slug: "completed" };
  if (raw.includes("cancel")) return { raw, slug: "canceled" };
  if (raw.includes("progress")) return { raw, slug: "in_progress" };
  if (raw.includes("review")) return { raw, slug: "under_review" };
  if (raw.includes("payment")) return { raw, slug: "payment_pending" };
  return { raw, slug: raw };
}

function extractCustomerName(customer: unknown): string | null {
  if (!customer || typeof customer !== "object") return null;
  const cust = customer as Record<string, unknown>;
  const nameFields = ["name","full_name","fullName","customer_name","customerName","first_name","firstName","display_name","displayName"];
  for (const f of nameFields) {
    const v = cust[f];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  const firstName = (cust as Record<string, unknown>).first_name || (cust as Record<string, unknown>).firstName;
  const lastName  = (cust as Record<string, unknown>).last_name  || (cust as Record<string, unknown>).lastName;
  if (typeof firstName === "string" && typeof lastName === "string") return `${firstName} ${lastName}`.trim();
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
  const h1 = getHeader(req, "x-webhook-token").trim(); if (h1) return h1;
  const h2 = getHeader(req, "x-salla-token").trim();   if (h2) return h2;
  const q  = typeof req.query.t === "string" ? req.query.t.trim() : "";
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
  } catch { return null; }
}
function encodeUrlForFirestore(url: string | null | undefined): string {
  if (!url) return "";
  return url.replace(/:/g,"_COLON_").replace(/\//g,"_SLASH_").replace(/\?/g,"_QUEST_").replace(/#/g,"_HASH_").replace(/&/g,"_AMP_");
}

// -------------------- Utilities --------------------
async function resolveStoreUid(db: FirebaseFirestore.Firestore, eventRaw: UnknownRecord, orderId: string): Promise<string | null> {
  const uid = pickStoreUidFromSalla(eventRaw) || null;
  if (uid) return uid;
  try {
    const o = await db.collection("orders").doc(orderId).get();
    const s = (o.data()?.storeUid as string) || null;
    if (s) return s;
  } catch {}
  return null;
}
async function getAccessTokenForStore(db: FirebaseFirestore.Firestore, storeUid: string | null): Promise<string | null> {
  if (!storeUid) return null;
  const tok = await db.collection("salla_tokens").doc(storeUid).get();
  return tok.exists ? String(tok.data()?.accessToken || "") : null;
}
async function fetchOrderDetailsFromSalla(db: FirebaseFirestore.Firestore, storeUid: string | null, orderId: string) {
  if (!storeUid || !orderId) return null;
  const accessToken = await getAccessTokenForStore(db, storeUid);
  if (!accessToken) return null;
  try {
    const resp = await fetch(`https://api.salla.dev/admin/v2/orders/${encodeURIComponent(orderId)}`, {
      headers: { Authorization: `Bearer ${accessToken}`, "Accept-Language": "ar" }
    });
    if (!resp.ok) {
      console.warn("fetchOrderDetailsFromSalla: non-OK", { status: resp.status, storeUid, orderId });
      return null;
    }
    const json = await resp.json();
    return json?.data ?? null;
  } catch (e) {
    console.warn("fetchOrderDetailsFromSalla error:", e);
    return null;
  }
}

// -------------------- Order snapshot & tokens --------------------
async function upsertOrderSnapshot(
  db: FirebaseFirestore.Firestore,
  order: SallaOrder,
  storeUid?: string | null
) {
  const orderId = String(order.id ?? order.order_id ?? "");
  if (!orderId) return;
  const norm = normalizeStatus(order.status ?? order.order_status ?? order.new_status ?? order.shipment_status ?? "");
  await db.collection("orders").doc(orderId).set({
    id: orderId,
    number: order.number ?? null,
    status: norm.raw,
    statusSlug: norm.slug,
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

// -------------------- إرسال مباشر --------------------
async function sendInviteDirectly(
  db: FirebaseFirestore.Firestore,
  order: SallaOrder,
  eventRaw: UnknownRecord
) {
  const orderId = String(order.id ?? order.order_id ?? "");
  if (!orderId) return { sent: false, reason: "missing_order_id" };

  const exists = await db.collection("review_invites").where("orderId","==",orderId).limit(1).get();
  if (!exists.empty) return { sent: false, reason: "already_invited" };

  const seed = await createInviteTokenAndDoc(db, order, eventRaw);
  if (!seed.inviteId || !seed.storeUid) return { sent: false, reason: "token_create_failed" };

  const quota = await canSendInvite(seed.storeUid);
  if (!quota.ok) {
    await db.collection("review_invites").doc(seed.inviteId).set({
      quotaDeniedAt: Date.now(),
      quotaReason: quota.reason,
    }, { merge: true });
    return { sent: false, reason: `quota:${quota.reason}` };
  }

  // قنوات الإرسال + Fallback
  let buyer: SallaCustomer = order.customer ?? {};
  if ((!buyer?.mobile && !buyer?.email)) {
    try {
      const storeUid = seed.storeUid || (await resolveStoreUid(db, eventRaw, orderId));
      const od = await fetchOrderDetailsFromSalla(db, storeUid, orderId);
      const cust = od?.customer || {};
      buyer = {
        name: cust?.name || buyer?.name || undefined,
        email: cust?.email || buyer?.email || undefined,
        mobile: cust?.mobile || buyer?.mobile || undefined,
      };
      if (!buyer?.mobile && !buyer?.email) {
        console.warn("sendInviteDirectly: no channels after fallback", { orderId, storeUid });
      }
    } catch (e) {
      console.warn("sendInviteDirectly: fallback fetch customer failed", e);
    }
  }

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

  const tasks: Array<Promise<unknown>> = [];
  if (buyer.mobile) {
    const mobile = String(buyer.mobile).replace(/\s+/g, "");
    tasks.push(sendSms(mobile, smsText));
  }
  if (buyer.email) {
    tasks.push(sendEmail(buyer.email, "قيّم تجربتك معنا", emailHtml));
  }

  if (!tasks.length) return { sent: false, reason: "no_channels" };

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

// -------------------- App Events --------------------
async function handleAppEvent(
  db: FirebaseFirestore.Firestore,
  event: SallaAppEvent,
  merchant: string | number | undefined,
  data: UnknownRecord
) {
  const uid = merchant != null ? `salla:${String(merchant)}` : "salla:unknown";
  await db.collection("salla_app_events").add({ uid, event, merchant: merchant ?? null, data, at: Date.now() });

  if (event === "app.store.authorize") {
  
    const access_token  = String((data as UnknownRecord)?.access_token || "");

    const refresh_token = ((data as UnknownRecord)?.refresh_token as string) || null;

    const expires       = Number((data as UnknownRecord)?.expires || 0);
    const expiresAt     = expires ? Date.now() + expires * 1000 : null;

    if (access_token) {
      await db.collection("salla_tokens").doc(uid).set({
        uid, provider: "salla", storeId: merchant ?? null,
        accessToken: access_token, refreshToken: refresh_token,
        expiresIn: expires || null, expiresAt,
        scope: (data as UnknownRecord)?.scope || null,
        obtainedAt: Date.now(),
      }, { merge: true });
    }

    // جلب معلومات المتجر + التاجر (Easy Mode)
    let domain: string | null = null;
    let storeName: string | null = null;
    let merchantEmail: string | null = null;

    try {
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

      // User Info (accounts) مع fallback
      let uiResp: Response | null = null;
      try {
        uiResp = await fetch("https://accounts.salla.sa/oauth2/user/info", {
          headers: { Authorization: `Bearer ${access_token}` }
        });
        if (!uiResp.ok) {
          console.warn("accounts.user.info non-OK", { status: uiResp.status });
          uiResp = null;
        }
      } catch (e) {
        console.warn("accounts.user.info error", e);
        uiResp = null;
      }

      if (!uiResp) {
        try {
          const adminUi = await fetch("https://api.salla.dev/admin/v2/user/info", {
            headers: { Authorization: `Bearer ${access_token}` }
          });
          if (adminUi.ok) {
            const j = await adminUi.json();
            merchantEmail = j?.data?.email || null;
            await db.collection("stores").doc(uid).set({
              "salla.merchantEmail": merchantEmail,
              "salla.merchantName": j?.data?.name || null,
            }, { merge: true });
          } else {
            console.warn("admin.user.info non-OK", { status: adminUi.status });
          }
        } catch (e) {
          console.warn("admin.user.info error", e);
        }
      } else {
        const j = await uiResp.json();
        merchantEmail = j?.email || null;
        await db.collection("stores").doc(uid).set({
          "salla.merchantEmail": merchantEmail,
          "salla.merchantName": j?.name || null,
        }, { merge: true });
      }
    } catch (fetchError) {
      console.warn("store/user info fetch error:", fetchError);
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

    if (merchantEmail && storeName && merchant) {
      try {
        console.log(`محاولة إرسال إيميل ترحيب للتاجر: ${merchantEmail} للمتجر: ${storeName} (${merchant})`);
        await sendMerchantWelcomeEmail({ merchantEmail, storeName, storeId: merchant, domain: domain || undefined, accessToken: access_token });
        console.log(`✅ تم إرسال إيميل الترحيب بنجاح للتاجر: ${merchantEmail}`);
        await db.collection("merchant_welcome_emails").add({
          merchantEmail, storeName, storeId: merchant, uid, domain, sentAt: Date.now(), status: "sent",
        });
      } catch (emailError) {
        console.error("❌ فشل في إرسال إيميل الترحيب:", {
          error: emailError, merchantEmail, storeName, storeId: merchant, uid, domain, timestamp: new Date().toISOString()
        });
        await db.collection("merchant_welcome_emails").add({
          merchantEmail, storeName, storeId: merchant, uid, domain, sentAt: Date.now(),
          status: "failed", error: emailError instanceof Error ? emailError.message : String(emailError),
        });
      }
    } else {
      console.warn("⚠️ لم يتم إرسال إيميل الترحيب - معلومات ناقصة:", {
        merchantEmail: !!merchantEmail, storeName: !!storeName, merchant: !!merchant, uid, domain
      });
    }
  }

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

    const doc = await db.collection("stores").doc(uid).get();
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = doc.data() as any;
    const base = toDomainBase(d?.salla?.domain || null);
    if (base) {
      const encodedBase = encodeUrlForFirestore(base);
      await db.collection("domains").doc(encodedBase).delete().catch(()=>{});
    }
  }

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
    const code = String(((data as UnknownRecord)?.plan_code || (data as UnknownRecord)?.plan || "P30")).toUpperCase() as PlanCode;
    const cfg = getPlanConfig(code);
    await db.collection("stores").doc(uid).set({
      plan: { code: cfg.code, active: true },
      usage: { invitesUsed: 0 },
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
      "salla.settings": (data as UnknownRecord)?.settings ?? {},
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

  // ✅ Token-only authentication (no signature, no production bypass)
  let isAuthenticated = false;
  const provided = extractProvidedToken(req);
  if (WEBHOOK_TOKEN && provided && timingSafeEq(provided, WEBHOOK_TOKEN)) {
    isAuthenticated = true;
  }

  // ⛔️ لا bypass في الإنتاج نهائيًا
  if (!isAuthenticated) {
    const isDevelopment = process.env.NODE_ENV !== "production";
    if (isDevelopment && process.env.SKIP_WEBHOOK_AUTH === "true") {
      console.warn("⚠️ Webhook auth bypassed in development (token-only mode).");
      isAuthenticated = true;
    }
  }

  if (!isAuthenticated) {
    console.error("❌ Webhook authentication failed (token-only)", {
      hasProvidedToken: !!provided,
      hasExpectedToken: !!WEBHOOK_TOKEN,
      env: process.env.NODE_ENV,
    });
    return res.status(401).json({ error: "authentication_failed" });
  }

  const db = dbAdmin();

  // Parse body
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

  console.log("Processing Salla webhook:", {
    event,
    orderId: String(asOrder.id ?? asOrder.order_id ?? "") || null,
    hasCustomer: !!asOrder.customer,
    customerEmail: asOrder.customer?.email || null,
    timestamp: Date.now()
  });

  // Idempotency
  const idemKey = crypto.createHash("sha256").update((provided || "") + "|").update(raw).digest("hex");
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

  // app.*
  if (event.startsWith("app.")) {
    await handleAppEvent(db, event as SallaAppEvent, body.merchant, dataRaw);
    await db.collection("processed_events").doc(keyOf(event)).set({ at: Date.now(), event, processed: true }, { merge: true });
    return res.status(200).json({ ok: true });
  }

  // Orders / Shipments
  const orderId = String(asOrder.id ?? asOrder.order_id ?? "");
  const statusRaw = (asOrder.status ?? asOrder.order_status ?? asOrder.new_status ?? asOrder.shipment_status ?? "");
  let { slug: statusNorm } = normalizeStatus(statusRaw);
  const paymentStatus = lc(safeStringExtract(asOrder.payment_status));
  const storeUidFromEvent = pickStoreUidFromSalla(dataRaw) || null;

  await upsertOrderSnapshot(db, asOrder, storeUidFromEvent);

  // 🔁 لو الحالة غير واضحة، اسحب Order Details لأخذ slug الرسمي
  if ((!statusNorm || statusNorm === statusRaw) && orderId) {
    try {
      const storeUid = storeUidFromEvent || (await resolveStoreUid(db, dataRaw, orderId));
      const od = await fetchOrderDetailsFromSalla(db, storeUid, orderId);
      const slug =
        lc(safeStringExtract((od?.status as Record<string, unknown>)?.slug)) ||
        lc(safeStringExtract(od?.status)) ||
        lc(safeStringExtract(od?.shipment_status)) ||
        lc(safeStringExtract(od?.order_status)) || "";
      statusNorm = normalizeStatus(slug).slug;
      console.log("Resolved status via API:", { orderId, statusNorm });
    } catch (e) {
      console.warn("status fallback failed:", e);
    }
  }

  const shouldSend =
    (event === "order.status.updated" || event === "shipment.updated") &&
    (statusNorm === "delivered" || statusNorm === "completed" || statusNorm === "complete" || statusNorm === "fulfilled");

  console.log("Decision:", {
    orderId, event,
    status: safeStringExtract(statusRaw),
    statusNorm,
    paymentStatus,
    shouldSend
  });

  // Fast ACK
  res.status(202).json({ ok: true, accepted: true, event });

  // Execute send after ack
  try {
    if (shouldSend) {
      const result = await sendInviteDirectly(db, asOrder, dataRaw);
      if (!result.sent) {
        await db.collection("webhook_errors").add({
          at: Date.now(), scope: "sendInviteDirectly", event, orderId,
          error: result.reason || "unknown_reason",
        }).catch(()=>{});
      }
    } else if (event === "order.cancelled" || event === "order.canceled") {
      await voidInvitesForOrder(db, orderId, "order_cancelled");
    } else if (event === "order.refunded") {
      await voidInvitesForOrder(db, orderId, "order_refunded");
    }
  } catch (e) {
    await db.collection("webhook_errors").add({
      at: Date.now(), scope: "sendInviteDirectly", event, orderId,
      error: e instanceof Error ? e.message : String(e),
    }).catch(()=>{});
  }
}
