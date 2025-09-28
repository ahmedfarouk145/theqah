// src/pages/api/salla/webhook.ts
import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import { dbAdmin } from "@/lib/firebaseAdmin";

// ===== Runtime =====
export const config = { api: { bodyParser: false } };

// ===== Types =====
type UnknownRecord = Record<string, unknown>;

interface SallaCustomer { name?: string; email?: string; mobile?: string; }
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
  data?: SallaOrder | UnknownRecord;
  created_at?: string;
}

// ===== Env =====
const WEBHOOK_SECRET = (process.env.SALLA_WEBHOOK_SECRET || "").trim();
const WEBHOOK_TOKEN  = (process.env.SALLA_WEBHOOK_TOKEN  || "").trim();
const APP_BASE_URL   = (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || "").replace(/\/+$/,"");
const SALLA_API_BASE = "https://api.salla.dev/admin/v2";
const USERINFO_URL   = "https://accounts.salla.sa/oauth2/user/info";

// ===== Utils =====
const lc = (x: unknown) => String(x ?? "").toLowerCase();
const DONE = new Set(["paid","fulfilled","delivered","completed","complete","تم التوصيل","مكتمل","تم التنفيذ"]);
const CANCEL = new Set(["canceled","cancelled","refunded","returned"]);

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
function verifySignature(raw: Buffer, req: NextApiRequest): boolean {
  const sigHeader = getHeader(req, "x-salla-signature");
  if (!WEBHOOK_SECRET || !sigHeader) return false;
  const expected = crypto.createHmac("sha256", WEBHOOK_SECRET).update(raw).digest("hex");
  return timingSafeEq(sigHeader, expected);
}
function extractProvidedToken(req: NextApiRequest): string {
  const auth = getHeader(req, "authorization").trim();
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return getHeader(req, "x-salla-token").trim() || getHeader(req, "x-webhook-token").trim() || (typeof req.query.t === "string" ? req.query.t.trim() : "");
}
function verifyToken(req: NextApiRequest): boolean {
  const provided = extractProvidedToken(req);
  return !!WEBHOOK_TOKEN && !!provided && timingSafeEq(provided, WEBHOOK_TOKEN);
}
function verifySallaRequest(req: NextApiRequest, raw: Buffer): { ok: boolean; strategy: "signature"|"token"|"none" } {
  const strategy = lc(getHeader(req, "x-salla-security-strategy") || "");
  if (strategy === "signature") return { ok: verifySignature(raw, req), strategy: "signature" };
  if (strategy === "token")     return { ok: verifyToken(req),      strategy: "token" };
  // Auto
  if (verifySignature(raw, req)) return { ok: true, strategy: "signature" };
  if (verifyToken(req))          return { ok: true, strategy: "token" };
  return { ok: false, strategy: "none" };
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
  if (bodyMerchant !== undefined && bodyMerchant !== null) return `salla:${String(bodyMerchant)}`;
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
function validEmailOrPhone(c?: SallaCustomer) {
  const email = c?.email?.trim(); const mobile = c?.mobile?.trim();
  const hasEmail = !!email && email.includes("@");
  const hasMobile = !!mobile && mobile.length > 5;
  return { ok: hasEmail || hasMobile, email: hasEmail ? email : undefined, mobile: hasMobile ? mobile : undefined };
}
const keyOf = (event: string, orderId?: string, status?: string) => `salla:${lc(event)}:${orderId ?? "none"}:${status ?? ""}`;

// ===== Firestore helpers =====
async function saveDomain(db: FirebaseFirestore.Firestore, uid: string, data: UnknownRecord, event: string) {
  const candidates = [
    data?.["domain"], data?.["store_url"], data?.["url"],
    (data?.["store"] as UnknownRecord)?.["domain"], (data?.["store"] as UnknownRecord)?.["url"],
    (data?.["merchant"] as UnknownRecord)?.["domain"], (data?.["merchant"] as UnknownRecord)?.["url"],
  ];
  const raw = candidates.find((x) => typeof x === "string" && x.trim()) as string|undefined;
  if (!raw) return;
  const base = toDomainBase(raw);
  if (!base) return;
  const key = encodeUrlForFirestore(base);

  await db.collection("stores").doc(uid).set({
    uid, provider: "salla",
    domain: { base, key, updatedAt: Date.now() },
    salla: { domain: base },  // توافق قديم
    updatedAt: Date.now(),
  }, { merge: true });

  await db.collection("domains").doc(key).set({
    base, key,
    uid, storeUid: uid,
    provider: "salla",
    updatedAt: Date.now(),
  }, { merge: true });

  await db.collection("salla_app_events").add({
    at: Date.now(), event, type: "domain_saved", uid, base
  }).catch(() => {});
}

async function upsertOrder(db: FirebaseFirestore.Firestore, order: SallaOrder, storeUid?: string|null) {
  const orderId = String(order.id ?? order.order_id ?? "");
  if (!orderId) return;
  await db.collection("orders").doc(orderId).set({
    id: orderId,
    number: order.number ?? null,
    status: lc(order.status ?? order.order_status ?? order.new_status ?? order.shipment_status ?? ""),
    paymentStatus: lc(order.payment_status ?? ""),
    customer: { name: order.customer?.name ?? null, email: order.customer?.email ?? null, mobile: order.customer?.mobile ?? null },
    storeUid: storeUid ?? null,
    platform: "salla",
    updatedAt: Date.now(),
  }, { merge: true });
}

async function voidInvitesForOrder(db: FirebaseFirestore.Firestore, orderId: string, reason: string) {
  if (!orderId) return;
  const q = await db.collection("review_tokens").where("orderId", "==", orderId).get();
  if (q.empty) return;
  const batch = db.batch();
  q.docs.forEach((doc) => batch.update(doc.ref, { voidedAt: Date.now(), voidReason: reason }));
  await batch.commit();
}

async function ensureInvite(db: FirebaseFirestore.Firestore, order: SallaOrder, rawData: UnknownRecord, bodyMerchant?: string|number) {
  const orderId = String(order.id ?? order.order_id ?? "");
  if (!orderId) return;

  // استخرج العميل من كل مكان ممكن
  let customer = order.customer as SallaCustomer | undefined;
  if (!customer?.email && !customer?.mobile) customer = (rawData["customer"] as SallaCustomer) || customer;
  if ((!customer?.email && !customer?.mobile) && rawData["order"] && typeof rawData["order"] === "object") {
    customer = (rawData["order"] as UnknownRecord)["customer"] as SallaCustomer || customer;
  }
  const cv = validEmailOrPhone(customer);
  if (!cv.ok) return;

  // Idempotency: لو فيه دعوة لنفس orderId
  const exists = await db.collection("review_invites").where("orderId", "==", orderId).limit(1).get();
  if (!exists.empty) return;

  let storeUid: string|null = pickStoreUidFromSalla(rawData, bodyMerchant) || null;
  if (!storeUid) {
    const orderDoc = await db.collection("orders").doc(orderId).get().catch(() => null);
    storeUid = orderDoc?.data()?.storeUid ?? null;
  }

  const productIds = extractProductIds(order.items);
  const mainProductId = productIds[0] || orderId;
  const tokenId = crypto.randomBytes(10).toString("hex");
  if (!APP_BASE_URL) throw new Error("BASE_URL not configured");

  const reviewUrl = `${APP_BASE_URL}/review/${tokenId}`;
  const publicUrl = reviewUrl; // لو عندك خدمة اختصار روابط استبدل هنا

  await db.collection("review_tokens").doc(tokenId).set({
    id: tokenId, platform: "salla", orderId, storeUid,
    productId: mainProductId, productIds,
    createdAt: Date.now(), usedAt: null,
    publicUrl, targetUrl: reviewUrl, channel: "multi",
  });

  await db.collection("review_invites").doc(tokenId).set({
    tokenId, orderId, platform: "salla", storeUid,
    productId: mainProductId, productIds,
    customer: { name: customer?.name ?? null, email: cv.email ?? null, mobile: cv.mobile ?? null },
    sentAt: Date.now(), deliveredAt: null, clicks: 0, publicUrl,
  });

  const storeName = getStoreOrMerchantName(rawData) ?? "متجرك";
  await db.collection("outbox_jobs").add({
    at: Date.now(),
    type: "send_invite_multi",
    payload: { inviteId: tokenId, country: "sa", phone: cv.mobile, email: cv.email, customerName: customer?.name, storeName, url: publicUrl, order: ["sms","email"] }
  }).catch(() => {});
}

// ===== Salla API helpers =====
async function fetchUserInfo(accessToken: string) {
  const resp = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!resp.ok) throw new Error(`userinfo ${resp.status}`);
  return resp.json() as Promise<UnknownRecord>;
}
async function registerDefaultWebhooks(accessToken: string, webhookUrl: string, secret: string) {
  // اجلب قائمة الأحداث لتأكيد الأسماء (اختياري)
  // await fetch(`${SALLA_API_BASE}/webhooks/events`, { headers: { Authorization: `Bearer ${accessToken}` } });

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` };
  const bodyBase = {
    url: webhookUrl,
    version: 2,
    // strategy default = Signature per docs; مرِّر secret لتمكين التحقق
    secret: secret,
  };

  // الأحداث الأساسية
  const events = [
    "order.payment.updated",
    "order.status.updated",
    "shipment.updated",
    "order.cancelled",
    "order.refunded",
    // دورة حياة التطبيق والاشتراكات
    "app.store.authorize",
    "app.installed",
    "app.updated",
    "app.uninstalled",
    "app.trial.started",
    "app.trial.expired",
    "app.trial.canceled",
    "app.subscription.started",
    "app.subscription.canceled",
    "app.subscription.expired",
    "app.subscription.renewed",
  ];

  // سجّل/حدّث واحدة واحدة (آمن وبسيط)
  for (const ev of events) {
    const body = JSON.stringify({ ...bodyBase, name: `auto:${ev}`, event: ev });
    await fetch(`${SALLA_API_BASE}/webhooks/subscribe`, { method: "POST", headers, body }).catch(() => {});
  }
}

// ===== Handler =====
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });
  const raw = await readRawBody(req);

  // أمن
  const verification = verifySallaRequest(req, raw);
  if (!verification.ok) {
    console.error("[SALLA][AUTH] invalid request", {
      strategy: getHeader(req, "x-salla-security-strategy") || "auto",
      hasSecret: !!WEBHOOK_SECRET, hasToken: !!WEBHOOK_TOKEN,
      from: req.headers["x-forwarded-for"] || req.socket.remoteAddress,
      sample: raw.toString("utf8").slice(0, 400),
    });
    return res.status(401).json({ error: "unauthorized" });
  }

  // ACK سريع
  res.status(202).json({ ok: true });

  const db = dbAdmin();

  // Parse
  let body: SallaWebhookBody = { event: "" };
  try {
    body = JSON.parse(raw.toString("utf8") || "{}");
  } catch (e) {
    await db.collection("webhook_errors").add({
      at: Date.now(), scope: "parse", error: e instanceof Error ? e.message : String(e),
      rawLen: raw.length, raw: raw.toString("utf8").slice(0, 2000), headers: req.headers,
    }).catch(() => {});
    return;
  }

  const event = String(body.event || "");
  const dataRaw = (body.data ?? {}) as UnknownRecord;
  const asOrder = dataRaw as SallaOrder;

  // Idempotency
  try {
    const sigHeader = getHeader(req, "x-salla-signature") || "";
    const idemKey = crypto.createHash("sha256").update(sigHeader + "|").update(raw).digest("hex");
    const idemRef = db.collection("webhooks_salla").doc(idemKey);
    if ((await idemRef.get()).exists) return;
    await idemRef.set({
      at: Date.now(), event,
      orderId: String(asOrder.id ?? asOrder.order_id ?? "") || null,
      status: lc(asOrder.status ?? asOrder.order_status ?? asOrder.new_status ?? asOrder.shipment_status ?? ""),
      paymentStatus: lc(asOrder.payment_status ?? ""),
      merchant: body.merchant ?? null,
      strategy: verification.strategy,
    });
  } catch (e) {
    console.error("[SALLA][IDEMP] failed:", e instanceof Error ? e.message : String(e));
  }

  // حفظ الدومين عند تنصيب/تفويض
  if (event === "app.store.authorize" || event === "app.installed") {
    const uid = body.merchant != null ? `salla:${String(body.merchant)}` :
      (asOrder?.merchant?.id != null ? `salla:${String(asOrder.merchant.id)}` : "salla:unknown");
    if (uid !== "salla:unknown") {
      await saveDomain(db, uid, dataRaw, event).catch(() => {});
    }
  }

  // معالجة رئيسية
  try {
    const orderId = String(asOrder.id ?? asOrder.order_id ?? "");
    const status = lc(asOrder.status ?? asOrder.order_status ?? asOrder.new_status ?? asOrder.shipment_status ?? "");
    const paymentStatus = lc(asOrder.payment_status ?? "");

    // 1) Easy Mode: استلام التوكن وتخزينه + user info + تسجيل webhooks
    if (event === "app.store.authorize" || event === "app.updated") {
      // سلة قد تعطيك الحقول مباشرة داخل data (تنويعات شائعة)
      const token   = String((dataRaw["access_token"] ?? (dataRaw["token"] as UnknownRecord)?.["access_token"] ?? "") || "");
      const refresh = String((dataRaw["refresh_token"] ?? (dataRaw["token"] as UnknownRecord)?.["refresh_token"] ?? "") || "");
      const expires = Number(dataRaw["expires"] ?? (dataRaw["token"] as UnknownRecord)?.["expires"] ?? 0); // seconds (unix) per docs
      const scope   = String(dataRaw["scope"] ?? (dataRaw["token"] as UnknownRecord)?.["scope"] ?? "") || undefined;

      const merchantId = body.merchant ?? (dataRaw["merchant_id"] ?? (dataRaw["merchant"] as UnknownRecord)?.["id"]);
      const storeUid = merchantId != null ? `salla:${String(merchantId)}` : undefined;

      if (token && storeUid) {
        // خزِّن التوكن في owners (أو stores) — اخترت owners + مرجع للمتجر
        await db.collection("owners").doc(storeUid).set({
          uid: storeUid,
          provider: "salla",
          oauth: {
            access_token: token,
            refresh_token: refresh || null,
            scope: scope || null,
            expires: expires || null,        // unix seconds per docs
            receivedAt: Date.now(),
            strategy: "easy_mode",
          },
          updatedAt: Date.now(),
        }, { merge: true });

        // اجلب userinfo واحفظ بيانات المتجر/الدومين
        try {
          const info = await fetchUserInfo(token);
          // حاول استخراج domain/url إن توفّرت
          //eslint-disable-next-line @typescript-eslint/no-explicit-any
          const domain = (info as any)?.store?.domain || (info as any)?.domain || (info as any)?.url || null;
          if (domain) {
            await saveDomain(db, storeUid, { domain }, event);
          }
          await db.collection("stores").doc(storeUid).set({
            uid: storeUid, provider: "salla",
            meta: { userinfo: info, updatedAt: Date.now() },
            updatedAt: Date.now(),
          }, { merge: true });
        } catch (e) {
          await db.collection("webhook_errors").add({
            at: Date.now(), scope: "userinfo", event, error: e instanceof Error ? e.message : String(e), merchant: storeUid
          }).catch(() => {});
        }

        // سجّل/حدّث الويبهوكس داخل متجر التاجر بالتوكن (إذا رغبت في إدارة الاشتراكات من طرفك)
        try {
          if (APP_BASE_URL && WEBHOOK_SECRET) {
            await registerDefaultWebhooks(token, `${APP_BASE_URL}/api/salla/webhook`, WEBHOOK_SECRET);
          }
        } catch (e) {
          await db.collection("webhook_errors").add({
            at: Date.now(), scope: "subscribe", event, error: e instanceof Error ? e.message : String(e), merchant: storeUid
          }).catch(() => {});
        }
      }

      await db.collection("salla_app_events").add({
        at: Date.now(), event, merchant: merchantId ?? null, data: dataRaw
      }).catch(() => {});
    }

    // 2) سنابشوت الطلب لأحداث الطلب/الشحن
    if (event.startsWith("order.") || event.startsWith("shipment.")) {
      const storeUidFromEvent = pickStoreUidFromSalla(dataRaw, body.merchant) || null;
      await upsertOrder(db, asOrder, storeUidFromEvent);
    }

    // 3) دعوات / إبطال
    if (event === "order.payment.updated") {
      if (["paid","authorized","captured"].includes(paymentStatus)) await ensureInvite(db, asOrder, dataRaw, body.merchant);
    } else if (event === "shipment.updated") {
      if (DONE.has(status) || ["delivered","completed"].includes(status)) await ensureInvite(db, asOrder, dataRaw, body.merchant);
    } else if (event === "order.status.updated") {
      if (DONE.has(status)) await ensureInvite(db, asOrder, dataRaw, body.merchant);
    } else if (event === "order.cancelled") {
      if (orderId) await voidInvitesForOrder(db, orderId, "order_cancelled");
    } else if (event === "order.refunded") {
      if (orderId) await voidInvitesForOrder(db, orderId, "order_refunded");
    }

    // 4) سجّل باقي الأحداث (معروفة/غير معالجة)
    const knownPrefixes = ["order.","shipment.","product.","customer.","category.","brand.","store.","cart.","invoice.","specialoffer.","app."];
    const isKnown = knownPrefixes.some((p)=>event.startsWith(p)) || event === "review.added";
    const col = isKnown ? "webhooks_salla_known" : "webhooks_salla_unhandled";
    await db.collection(col).add({ at: Date.now(), event, data: dataRaw }).catch(() => {});

    // 5) علامة “تمت المعالجة”
    await db.collection("processed_events").doc(keyOf(event, orderId, status)).set({
      at: Date.now(), event, processed: true, status
    }, { merge: true });

    // بعض اللوج
    await db.collection("salla_app_events").add({
      at: Date.now(), event, kind: "processed", orderId: orderId || null, status, paymentStatus
    }).catch(() => {});
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[SALLA][ERROR] processing failed", msg);
    await db.collection("webhook_errors").add({
      at: Date.now(), scope: "handler", event, error: msg,
      orderId: String((body.data as SallaOrder)?.id ?? (body.data as SallaOrder)?.order_id ?? "") || null,
      raw: raw.toString("utf8").slice(0, 2000),
    }).catch(() => {});
  }
}
