import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import { dbAdmin } from "@/lib/firebaseAdmin";
import { createShortLink } from "@/server/short-links";
import { canSendInvite } from "@/server/billing/usage";
import { getPlanConfig, type PlanCode } from "@/server/billing/plans";
import { sendMerchantWelcomeEmail } from "@/server/messaging/merchant-welcome";
import { tryChannels } from "@/server/messaging/send-invite";

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
  merchant?: string | number;
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

// ====== STATUS NORMALIZATION ======
function safeStringExtract(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const v =
      obj["slug"] ?? obj["status"] ?? obj["name"] ?? obj["value"] ??
      obj["state"] ?? obj["text"] ?? obj["label"];
    if (typeof v === "string") return v;
    if (typeof v === "number") return String(v);
  }
  return "";
}

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

// أسماء العملاء
function extractCustomerName(customer: unknown): string | null {
  if (!customer || typeof customer !== "object") return null;
  const cust = customer as Record<string, unknown>;
  const fields = ["name","full_name","fullName","customer_name","customerName","first_name","firstName","display_name","displayName"];
  for (const f of fields) {
    const v = cust[f];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  const fn = (cust as Record<string, unknown>)["first_name"] ?? (cust as Record<string, unknown>)["firstName"];
  const ln = (cust as Record<string, unknown>)["last_name"]  ?? (cust as Record<string, unknown>)["lastName"];
  if (typeof fn === "string" && typeof ln === "string") return `${fn} ${ln}`.trim();
  return null;
}

// Raw body
function readRawBody(req: NextApiRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// Token helpers
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

// Store/merchant helpers
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
  for (const it of (items || [])) {
    const raw = it?.product_id ?? it?.product?.id ?? it?.id;
    if (raw !== undefined && raw !== null) ids.add(String(raw));
  }
  return [...ids];
}

// ===== DOMAIN (KEEP AS IS) =====
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function toDomainBase(domain: string | null | undefined): string | null {
  if (!domain) return null;
  try {
    const u = new URL(String(domain));
    const origin = u.origin.toLowerCase();
    const firstSeg = u.pathname.split("/").filter(Boolean)[0] || "";
    return firstSeg && firstSeg.startsWith("dev-") ? `${origin}/${firstSeg}` : origin;
  } catch { return null; }
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function encodeUrlForFirestore(url: string | null | undefined): string {
  if (!url) return "";
  return url
    .replace(/:/g, "_COLON_")
    .replace(/\//g, "_SLASH_")
    .replace(/\?/g, "_QUEST_")
    .replace(/#/g, "_HASH_")
    .replace(/&/g, "_AMP_");
}
// ===== END DOMAIN (KEEP AS IS) =====

// Access tokens
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
    if (!resp.ok) return null;
    const json = await resp.json();
    return json?.data ?? null;
  } catch { return null; }
}
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
      mobile: buyer.mobile ?? null,
    },
    sentAt: Date.now(), deliveredAt: null, clicks: 0, publicUrl,
  });

  return { inviteId: inviteRef.id, tokenId, publicUrl, storeUid, productIds };
}

// -------------------- إرسال مباشر عبر tryChannels --------------------
async function sendInviteDirectly(
  db: FirebaseFirestore.Firestore,
  order: SallaOrder,
  eventRaw: UnknownRecord
) {
  const orderId = String(order.id ?? order.order_id ?? "");
  if (!orderId) return { sent: false, reason: "missing_order_id" };

  const exists = await db.collection("review_invites")
    .where("orderId","==",orderId).limit(1).get();
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
      const od = await fetchOrderDetailsFromSalla(db, seed.storeUid, orderId);
      const cust = (od as UnknownRecord | null)?.["customer"] as UnknownRecord | undefined;
      buyer = {
        name: (cust?.["name"] as string) || buyer?.name || undefined,
        email: (cust?.["email"] as string) || buyer?.email || undefined,
        mobile: (cust?.["mobile"] as string) || buyer?.mobile || undefined,
      };
    } catch (e) {
      console.warn("sendInviteDirectly: fallback fetch customer failed", e);
    }
  }

  const storeName = getStoreOrMerchantName(eventRaw) ?? "المتجر";
  const customerName = extractCustomerName(buyer) || "العميل";

  const result = await tryChannels({
    inviteId: seed.inviteId,
    country: "sa",
    phone: buyer.mobile || undefined,
    email: buyer.email || undefined,
    customerName,
    storeName,
    url: seed.publicUrl!,
    strategy: "all",
    order: ["sms","email"]
  });

  await db.collection("review_invites").doc(seed.inviteId).set({
    lastResult: {
      ok: result.ok,
      firstSuccessChannel: result.firstSuccessChannel,
      attempts: result.attempts || [],
      at: Date.now(),
    }
  }, { merge: true });

  if (!result.ok) {
    return { sent: false, reason: "no_channels_or_failed" };
  }
  return { sent: true, inviteId: seed.inviteId, channels: result.attempts.length };
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
  // prefer-const fix
  const uid = merchant != null ? `salla:${String(merchant)}` : "salla:unknown";
  await db.collection("salla_app_events").add({ uid, event, merchant: merchant ?? null, data, at: Date.now() });

  if (event === "app.store.authorize") {
    const access_token  = String((data as Record<string, unknown>)?.["access_token"] || "");
    const refresh_token = (data as Record<string, unknown>)?.["refresh_token"] as string | null | undefined || null;
    const expires       = Number((data as Record<string, unknown>)?.["expires"] || 0);
    const expiresAt     = expires ? Date.now() + expires * 1000 : null;

    if (access_token) {
      await db.collection("salla_tokens").doc(uid).set({
        uid, provider: "salla", storeId: merchant ?? null,
        accessToken: access_token, refreshToken: refresh_token,
        expiresIn: expires || null, expiresAt,
        scope: (data as Record<string, unknown>)?.["scope"] || null,
        obtainedAt: Date.now(),
      }, { merge: true });
    }

    await db.collection("stores").doc(uid).set({
      uid, platform: "salla",
      "salla.storeId": merchant ?? null,
      "salla.connected": true,
      "salla.installed": true,
      "salla.installedAt": Date.now(),
      updatedAt: Date.now(),
    }, { merge: true });

    // محاولة جلب بيانات التاجر لإرسال إيميل ترحيب
    let merchantEmail: string | null = null;
    let storeNameForEmail: string | undefined = getStoreOrMerchantName(data);
    try {
      let uiResp: Response | null = null;
      try {
        uiResp = await fetch("https://accounts.salla.sa/oauth2/user/info", {
          headers: { Authorization: `Bearer ${access_token}` }
        });
        if (!uiResp.ok) uiResp = null;
      } catch { uiResp = null; }

      if (!uiResp) {
        const adminUi = await fetch("https://api.salla.dev/admin/v2/user/info", {
          headers: { Authorization: `Bearer ${access_token}` }
        });
        if (adminUi.ok) {
          const j = await adminUi.json();
          merchantEmail = j?.data?.email || null;
          storeNameForEmail = storeNameForEmail ?? j?.data?.name ?? undefined;
          await db.collection("stores").doc(uid).set({
            "salla.merchantEmail": merchantEmail,
            "salla.merchantName": j?.data?.name || null,
          }, { merge: true });
        }
      } else {
        const j = await uiResp.json();
        merchantEmail = j?.email || null;
        storeNameForEmail = storeNameForEmail ?? j?.name ?? undefined;
        await db.collection("stores").doc(uid).set({
          "salla.merchantEmail": merchantEmail,
          "salla.merchantName": j?.name || null,
        }, { merge: true });
      }
    } catch { /* ignore */ }

    // fix: اضمن تمرير string وليس undefined
    if (merchantEmail && merchant != null) {
      const safeStoreName = storeNameForEmail ?? `متجر رقم ${String(merchant)}`;
      try {
        await sendMerchantWelcomeEmail({
          merchantEmail,
          storeName: safeStoreName,            // <-- string
          storeId: merchant,
          domain: undefined,
          accessToken: access_token,
        });
        await db.collection("merchant_welcome_emails").add({
          merchantEmail, storeId: merchant, uid, sentAt: Date.now(), status: "sent",
        });
      } catch (emailError) {
        await db.collection("merchant_welcome_emails").add({
          merchantEmail, storeId: merchant, uid, sentAt: Date.now(),
          status: "failed", error: emailError instanceof Error ? emailError.message : String(emailError),
        });
      }
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
    const code = String(((data as Record<string, unknown>)?.["plan_code"] || (data as Record<string, unknown>)?.["plan"] || "P30")).toUpperCase() as PlanCode;
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
      "salla.settings": (data as Record<string, unknown>)?.["settings"] ?? {},
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

  // ✅ Token-only auth
  let isAuthenticated = false;
  const provided = extractProvidedToken(req);
  if (WEBHOOK_TOKEN && provided && timingSafeEq(provided, WEBHOOK_TOKEN)) {
    isAuthenticated = true;
  }
  if (!isAuthenticated) {
    const isDev = process.env.NODE_ENV !== "production";
    if (isDev && process.env.SKIP_WEBHOOK_AUTH === "true") {
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
  } catch {
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

  // -------- app.* --------
  if (event.startsWith("app.")) {
    await handleAppEvent(db, event as SallaAppEvent, body.merchant, dataRaw);
    await db.collection("processed_events").doc(keyOf(event)).set({ at: Date.now(), event, processed: true }, { merge: true });
    return res.status(200).json({ ok: true });
  }

  // -------- Orders / Shipments --------
  const orderId = String(asOrder.id ?? asOrder.order_id ?? "");
  // prefer-const fix
  const statusRaw = (asOrder.status ?? asOrder.order_status ?? asOrder.new_status ?? asOrder.shipment_status ?? "");
  let { slug: statusNorm } = normalizeStatus(statusRaw);
  const paymentStatus = lc(safeStringExtract(asOrder.payment_status));
  const storeUidFromEvent = pickStoreUidFromSalla(dataRaw) || null;

  await upsertOrderSnapshot(db, asOrder, storeUidFromEvent);

  // لو الحالة غير واضحة، اسحب Order Details لأخذ slug الرسمي (بدون any)
  if ((!statusNorm || statusNorm === statusRaw) && orderId) {
    try {
      const storeUid = storeUidFromEvent || (await resolveStoreUid(db, dataRaw, orderId));
      const od = await fetchOrderDetailsFromSalla(db, storeUid, orderId);
      const pickSlug = (obj: unknown): string => {
        if (obj && typeof obj === "object") {
          const o = obj as Record<string, unknown>;
          const s = o["slug"];
          if (typeof s === "string" && s) return s;
        }
        return safeStringExtract(obj);
      };
      const slug =
        lc(pickSlug((od as UnknownRecord | null)?.["status"])) ||
        lc(pickSlug((od as UnknownRecord | null)?.["shipment_status"])) ||
        lc(pickSlug((od as UnknownRecord | null)?.["order_status"])) || "";
      statusNorm = normalizeStatus(slug).slug;
      console.log("Resolved status via API:", { orderId, statusNorm });
    } catch { /* ignore */ }
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

  res.status(202).json({ ok: true, accepted: true, event });

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
