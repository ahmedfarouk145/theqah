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
const DONE  = new Set(["paid","fulfilled","delivered","completed","complete"]);
const CANCEL= new Set(["canceled","cancelled","refunded","returned"]);
const lc = (x: unknown) => String(x ?? "").toLowerCase();
const keyOf = (event: string, orderId?: string, status?: string) =>
  `salla:${lc(event)}:${orderId ?? "none"}:${status ?? ""}`;

// ===== DOMAIN HELPERS (from your “keep as is”) =====
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

// -------------------- Order snapshot & invites --------------------
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

  // ⬇️ نرسل القناتين معًا (متوازي) + نمرّر إعدادات السعودية للـSMS
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

// -------------------- Handle app.* events --------------------
async function handleAppEvent(
  db: FirebaseFirestore.Firestore,
  event: SallaAppEvent,
  merchant: string | number | undefined,
  data: UnknownRecord
) {
  const uid = merchant != null ? `salla:${String(merchant)}` : "salla:unknown";

  await db.collection("salla_app_events").add({ uid, event, merchant: merchant ?? null, data, at: Date.now() });

  // ========= NEW: extract & store domain (on authorize/installed) =========
  const maybeSaveDomain = async () => {
    // نحاول نلاقي حقل دومين من البيانات (حسب اللي سلة بترجعه)
    // شائعة: domain / store.domain / store_url / url
    // كمان ممكن يجي رابط لوحة (فيه path) فنطبّعه إلى origin أو origin/dev-*
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
    console.log("[SALLA][DOMAIN] detected & normalized", { event, uid, domainRaw, base, key });

    // نخزّنها في documents سهلة للرجوع:
    // - stores/{uid}: domain.base + domain.key
    // - domains/{key}: reverse lookup
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

    console.log("[SALLA][DOMAIN] saved", { uid, base, key });
  };
  // ========================================================================

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
        uid,
        provider: "salla",
        storeId: merchant ?? null,
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt,
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
        scope: (data as any)?.scope || null,
        obtainedAt: Date.now(),
      }, { merge: true });
      console.log("[SALLA][AUTH] token stored", { uid, hasAccessToken: !!access_token, expiresAt });
    }

    await db.collection("stores").doc(uid).set({
      uid,
      platform: "salla",
      salla: { storeId: merchant ?? null, connected: true, installed: true, installedAt: Date.now() },
      updatedAt: Date.now(),
    }, { merge: true });
    console.log("[SALLA][APP] store.authorize stored flags", { uid, merchant });

    // ⬅️ نحاول حفظ الدومين (لو موجود في البيانات)
    await maybeSaveDomain();
  }

  if (event === "app.installed") {
    await db.collection("stores").doc(uid).set({
      uid,
      platform: "salla",
      salla: { storeId: merchant ?? null, installed: true, installedAt: Date.now() },
      updatedAt: Date.now(),
    }, { merge: true });
    console.log("[SALLA][APP] installed", { uid, merchant });

    await maybeSaveDomain();
  }

  if (event === "app.uninstalled") {
    await db.collection("stores").doc(uid).set({
      uid,
      platform: "salla",
      salla: { storeId: merchant ?? null, installed: false, connected: false, uninstalledAt: Date.now() },
      updatedAt: Date.now(),
    }, { merge: true });
    console.log("[SALLA][APP] uninstalled", { uid, merchant });
  }

  if (event.startsWith("app.trial.") || event.startsWith("app.subscription.")) {
    await db.collection("stores").doc(uid).set({
      uid,
      platform: "salla",
      salla: { storeId: merchant ?? null, subscription: { lastEvent: event, data, updatedAt: Date.now() } },
      updatedAt: Date.now(),
    }, { merge: true });
    console.log("[SALLA][APP] subscription/trial event saved", { uid, event });
  }

  if (event === "app.settings.updated") {
    await db.collection("stores").doc(uid).set({
      uid,
      platform: "salla",
      //eslint-disable-next-line @typescript-eslint/no-explicit-any
      salla: { storeId: merchant ?? null, settings: (data as any)?.settings ?? {} },
      updatedAt: Date.now(),
    }, { merge: true });
    console.log("[SALLA][APP] settings updated", { uid });
  }

  if (event === "app.feedback.created") {
    await db.collection("stores").doc(uid).collection("app_feedback").add({ at: Date.now(), data });
    console.log("[SALLA][APP] feedback stored", { uid });
  }
}

// -------------------- Handler --------------------
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  // ✅ يقبل Bearer / x-webhook-token / x-salla-token / ?t=
  const provided = extractProvidedToken(req);
  if (!WEBHOOK_TOKEN || !provided || !timingSafeEq(provided, WEBHOOK_TOKEN)) {
    console.error("[SALLA][AUTH] invalid token", {
      hasProvidedToken: !!provided,
      hasExpectedToken: !!WEBHOOK_TOKEN,
      from: req.headers["x-forwarded-for"] || req.socket.remoteAddress,
    });
    return res.status(401).json({ error: "invalid_webhook_token" });
  }

  const raw = await readRawBody(req);
  const db = dbAdmin();

  let body: SallaWebhookBody = { event: "" };
  try {
    body = JSON.parse(raw.toString("utf8") || "{}") as SallaWebhookBody;
  } catch {
    console.error("[SALLA][PARSE] invalid_json");
    return res.status(400).json({ error: "invalid_json" });
  }

  const event = String(body.event || "");
  const dataRaw = (body.data ?? {}) as UnknownRecord;
  const asOrder = dataRaw as SallaOrder;

  console.log("[SALLA][RECV]", {
    event,
    orderId: String(asOrder.id ?? asOrder.order_id ?? "") || null,
    hasCustomer: !!asOrder.customer,
    customerEmail: asOrder.customer?.email || null,
    at: new Date().toISOString(),
  });

  // Idempotency (يشمل كل الأحداث)
  const idemKey = crypto.createHash("sha256").update(provided + "|").update(raw).digest("hex");
  const idemRef = db.collection("webhooks_salla").doc(idemKey);
  if ((await idemRef.get()).exists) {
    console.log("[SALLA][IDEMP] deduped", { event });
    return res.status(200).json({ ok: true, deduped: true });
  }
  await idemRef.set({
    at: Date.now(),
    event,
    orderId: String(asOrder.id ?? asOrder.order_id ?? "") || null,
    status: lc(asOrder.status ?? asOrder.order_status ?? asOrder.new_status ?? asOrder.shipment_status ?? ""),
    paymentStatus: lc(asOrder.payment_status ?? ""),
    merchant: body.merchant ?? null,
  });

  // فرع أحداث Partner Portal (app.*)
  if (event.startsWith("app.")) {
    await handleAppEvent(db, event as SallaAppEvent, body.merchant, dataRaw);
    await db.collection("processed_events").doc(keyOf(event)).set({ at: Date.now(), event, processed: true }, { merge: true });
    console.log("[SALLA][OK] app.* handled", { event });
    return res.status(200).json({ ok: true });
  }

  // أوامر الطلبات / الشحن
  const orderId = String(asOrder.id ?? asOrder.order_id ?? "");
  const status = lc(asOrder.status ?? asOrder.order_status ?? asOrder.new_status ?? asOrder.shipment_status ?? "");
  const paymentStatus = lc(asOrder.payment_status ?? "");
  const storeUidFromEvent = pickStoreUidFromSalla(dataRaw) || null;

  await upsertOrderSnapshot(db, asOrder, storeUidFromEvent);

  // القواعد:
  // - after_payment: عبر order.payment.updated بحالة paid/authorized/captured
  // - after_delivery: عبر shipment.updated (delivered) أو order.status.updated (completed)
  // - أي cancel/refund قبل الإرسال ⇒ void
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
  }

  await db.collection("processed_events")
    .doc(keyOf(event, orderId, status))
    .set({ at: Date.now(), event, processed: true, status }, { merge: true });

  console.log("[SALLA][OK] order/shipment handled", { event, orderId, status });
  return res.status(200).json({ ok: true });
}
