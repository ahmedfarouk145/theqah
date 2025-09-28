// src/pages/api/salla/webhook.ts
import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import { dbAdmin } from "@/lib/firebaseAdmin";
import { fetchUserInfo } from "@/lib/sallaClient"; // يستعمل توكن مخزن حسب متجر
import { canSendInvite, onInviteSent } from "@/server/subscription/usage";

export const config = { api: { bodyParser: false } };

/* ===================== Types ===================== */

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

/* ===================== Env & const ===================== */

const WEBHOOK_SECRET = (process.env.SALLA_WEBHOOK_SECRET || "").trim();
const WEBHOOK_TOKEN  = (process.env.SALLA_WEBHOOK_TOKEN  || "").trim();
const APP_BASE_URL   = (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || "").replace(/\/+$/,"");

const DONE = new Set(["paid","fulfilled","delivered","completed","complete","تم التوصيل","مكتمل","تم التنفيذ"]);
const lc = (x: unknown) => String(x ?? "").toLowerCase();

type LogLevel = "debug" | "info" | "warn" | "error";

/* ===================== Logging helper ===================== */

async function fbLog(
  db: FirebaseFirestore.Firestore,
  entry: {
    level: LogLevel;
    scope: string;
    msg: string;
    event?: string;
    idemKey?: string;
    merchant?: string | number | null;
    orderId?: string | null;
    meta?: Record<string, unknown>;
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

  const line = `[${entry.level.toUpperCase()}][${entry.scope}] ${entry.msg} :: ${JSON.stringify({
    event: payload.event, merchant: payload.merchant, orderId: payload.orderId, idemKey: payload.idemKey
  })}`;

  if (entry.level === "error" || entry.level === "warn") {
    console.error(line);
  } else {
    console.log(line);
  }

  try { await db.collection("webhook_firebase").add(payload); }
  catch (e) { console.error("[WEBHOOK_LOG][WRITE_FAIL]", e); }
}

/* ===================== Utils ===================== */

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

/* ---------- Security ---------- */

function verifySignature(raw: Buffer, req: NextApiRequest): boolean {
  const sig = getHeader(req, "x-salla-signature");
  if (!WEBHOOK_SECRET || !sig) return false;
  const expected = crypto.createHmac("sha256", WEBHOOK_SECRET).update(raw).digest("hex");
  return timingSafeEq(sig, expected);
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
function encodeUrlForFirestore(url: string | null | undefined): string {
  if (!url) return "";
  return url
    .replace(/:/g, "_COLON_")
    .replace(/\//g, "_SLASH_")
    .replace(/\?/g, "_QUEST_")
    .replace(/#/g, "_HASH_")
    .replace(/&/g, "_AMP_");
}
function pickStoreUidFromSalla(eventData: UnknownRecord, bodyMerchant?: string | number): string | undefined {
  if (bodyMerchant !== undefined && bodyMerchant !== null) return `salla:${String(bodyMerchant)}`;
  const store = eventData["store"] as UnknownRecord | undefined;
  const merchant = eventData["merchant"] as UnknownRecord | undefined;
  const sid = (store?.["id"] as unknown) ?? (merchant?.["id"] as unknown);
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

/* ---------- Schema helpers ---------- */

// مفاتيح متوقعة بشكل خفيف لكل حدث (راقب التغييرات)
const EXPECTED_KEYS: Record<string, string[]> = {
  "app.store.authorize": ["access_token", "expires", "refresh_token", "scope", "token_type"],
  "app.installed": ["id", "app_name", "app_type", "installation_date", "store_type"],
  // زوّد حسب الحاجة...
};

function validateSchema(event: string, data: UnknownRecord) {
  const issues: string[] = [];
  if (event === "app.store.authorize") {
    const tok = (data["access_token"] ??
      (typeof data["token"] === "object" && data["token"]
        ? (data["token"] as UnknownRecord)["access_token"]
        : undefined));
    if (typeof tok !== "string" || !tok) issues.push("access_token missing for authorize");
  }
  // في installed/updated التوكنات اختيارية — لا نعتبرها خطأ
  return { ok: issues.length === 0, issues };
}
function diffKeys(event: string, data: UnknownRecord) {
  const expected = EXPECTED_KEYS[event];
  if (!expected) return { missing: [] as string[], extra: [] as string[] };
  const got = Object.keys(data || {});
  const missing = expected.filter(k => !got.includes(k));
  const extra = got.filter(k => !expected.includes(k));
  return { missing, extra };
}

/* ===================== Firestore Ops ===================== */

async function saveDomainAndFlags(
  db: FirebaseFirestore.Firestore,
  uid: string,
  merchantId: string | number | null,
  base: string | null | undefined,
  event: string
) {
  const now = Date.now();
  const numericStoreId =
    typeof merchantId === "number" ? merchantId : Number(String(merchantId ?? "").trim() || NaN);

  // نبني الدوكيومنت بدون undefined
  const storeDoc: Record<string, unknown> = {
    uid,
    provider: "salla",
    updatedAt: now,
    salla: {
      uid,
      storeId: Number.isFinite(numericStoreId) ? numericStoreId : (merchantId !== null ? String(merchantId) : null),
      connected: true,
      installed: true,
      ...(base ? { domain: base } : {}),
    },
    ...(base ? { domain: { base, key: encodeUrlForFirestore(base), updatedAt: now } } : {}),
  };

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
    customer: { name: order.customer?.name ?? null, email: order.customer?.email ?? null, mobile: order.customer?.mobile ?? null },
    storeUid: storeUid ?? null,
    platform: "salla",
    updatedAt: Date.now(),
  }, { merge: true });
}

async function ensureInviteForOrder(
  db: FirebaseFirestore.Firestore,
  order: SallaOrder,
  rawData: UnknownRecord,
  bodyMerchant?: string|number
) {
  const orderId = String(order.id ?? order.order_id ?? "");
  if (!orderId) return;

  let customer = order.customer as SallaCustomer | undefined;
  if (!customer?.email && !customer?.mobile) customer = (rawData["customer"] as SallaCustomer) || customer;
  if ((!customer?.email && !customer?.mobile) && rawData["order"] && typeof rawData["order"] === "object") {
    customer = (rawData["order"] as UnknownRecord)["customer"] as SallaCustomer || customer;
  }
  const cv = validEmailOrPhone(customer);
  if (!cv.ok) return;

  const exists = await db.collection("review_invites").where("orderId", "==", orderId).limit(1).get();
  if (!exists.empty) return;

  let storeUid: string|null = pickStoreUidFromSalla(rawData, bodyMerchant) || null;
  if (!storeUid) {
    const orderDoc = await db.collection("orders").doc(orderId).get().catch(() => null);
    storeUid = orderDoc?.data()?.storeUid ?? null;
  }

  const planCheck = storeUid ? await canSendInvite(storeUid) : { ok: true as const };
  if (!planCheck.ok) {
    await db.collection("quota_events").add({
      at: Date.now(), storeUid, orderId, type: "invite_blocked", reason: planCheck.reason
    }).catch(()=>{});
    return;
  }

  const productIds = extractProductIds(order.items);
  const mainProductId = productIds[0] || orderId;

  if (!APP_BASE_URL) throw new Error("BASE_URL not configured");

  const tokenId = crypto.randomBytes(10).toString("hex");
  const reviewUrl = `${APP_BASE_URL}/review/${tokenId}`;
  const publicUrl = reviewUrl;

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

  await db.collection("invite_sends").add({
    at: Date.now(), tokenId, orderId, storeUid, via: ["sms","email"], publicUrl
  }).catch(()=>{});

  if (storeUid) await onInviteSent(storeUid);
}

/* ===================== Handler ===================== */

const keyOf = (event: string, orderId?: string, status?: string) => `salla:${lc(event)}:${orderId ?? "none"}:${status ?? ""}`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const raw = await readRawBody(req);
  const db = dbAdmin();

  // (1) Security check + log
  const verification = verifySallaRequest(req, raw);
  await fbLog(db, {
    level: verification.ok ? "info" : "warn",
    scope: "auth",
    msg: verification.ok ? "verification ok" : "verification failed",
    meta: {
      strategyHeader: getHeader(req, "x-salla-security-strategy") || "auto",
      hasSecret: !!WEBHOOK_SECRET,
      hasToken: !!WEBHOOK_TOKEN,
      sigLen: (getHeader(req, "x-salla-signature") || "").length,
      from: req.headers["x-forwarded-for"] || req.socket.remoteAddress
    }
  });

  if (!verification.ok) return res.status(401).json({ error: "unauthorized" });

  // (2) Fast ACK (نرد فورًا ثم نكمل المعالجة بالخلفية)
  res.status(202).json({ ok: true, accepted: true });

  // (3) Parse body + schema logs
  let body: SallaWebhookBody = { event: "" };
  try {
    body = JSON.parse(raw.toString("utf8") || "{}");
  } catch (e) {
    await fbLog(db, {
      level: "error", scope: "parse", msg: "invalid json",
      meta: { err: e instanceof Error ? e.message : String(e), rawFirst2000: raw.toString("utf8").slice(0, 2000) }
    });
    await db.collection("webhook_errors").add({
      at: Date.now(), scope: "parse", error: e instanceof Error ? e.message : String(e),
      raw: raw.toString("utf8").slice(0, 2000), headers: req.headers
    }).catch(() => {});
    return;
  }

  const event = String(body.event || "");
  const dataRaw = (body.data ?? {}) as UnknownRecord;
  const asOrder = dataRaw as SallaOrder;

  // استخرج merchantId كبدائي فقط (string|number|null)
  const merchantIdRaw =
    body.merchant ??
    dataRaw["merchant_id"] ??
    (typeof dataRaw["merchant"] === "object" && dataRaw["merchant"]
      ? (dataRaw["merchant"] as { id?: unknown }).id
      : undefined);

  const merchantId: string | number | null =
    typeof merchantIdRaw === "number" || typeof merchantIdRaw === "string"
      ? merchantIdRaw
      : null;

  const storeUid = merchantId !== null ? `salla:${String(merchantId)}` : undefined;

  const isOrderEvent = event.startsWith("order.") || event.startsWith("shipment.");
  const orderId: string | null = isOrderEvent
    ? (String(asOrder.id ?? asOrder.order_id ?? "") || null)
    : null;

  // فحص بسيط للمخطط + diff keys
  const schema = validateSchema(event, dataRaw);
  await fbLog(db, {
    level: schema.ok ? "info" : "warn",
    scope: "schema",
    msg: schema.ok ? "payload matches minimal spec" : "payload mismatches minimal spec",
    event, merchant: merchantId, orderId, meta: { issues: schema.issues }
  });

  const keyDiff = diffKeys(event, dataRaw);
  if (keyDiff.missing.length || keyDiff.extra.length) {
    await fbLog(db, {
      level: "warn", scope: "schema.diff",
      msg: "payload keys differ from expected",
      event, merchant: merchantId, orderId, meta: keyDiff
    });
  }

  // (4) Idempotency (يدعم signature أو token)
  const sigHeader = getHeader(req, "x-salla-signature") || "";
  const idemKey = sigHeader
    ? crypto.createHash("sha256").update(sigHeader + "|").update(raw).digest("hex")
    : crypto.createHash("sha256").update("token|" + raw).digest("hex");
  const idemRef = db.collection("webhooks_salla").doc(idemKey);

  try {
    const ex = await idemRef.get();
    if (ex.exists) {
      await fbLog(db, { level: "info", scope: "idempotency", msg: "duplicate detected; skip processing", event, idemKey, merchant: merchantId, orderId });
      await idemRef.set({ statusFlag: "duplicate", lastSeenAt: Date.now() }, { merge: true });
      return;
    }
    await idemRef.set({
      at: Date.now(),
      event,
      orderId,
      status: lc(asOrder.status ?? asOrder.order_status ?? asOrder.new_status ?? asOrder.shipment_status ?? ""),
      paymentStatus: lc(asOrder.payment_status ?? ""),
      merchant: merchantId,
      strategy: verification.strategy,
      statusFlag: "processing",
      processingStartedAt: Date.now()
    }, { merge: true });
    await fbLog(db, { level: "debug", scope: "idempotency", msg: "idem stored", event, idemKey, merchant: merchantId, orderId });
  } catch (e) {
    await fbLog(db, { level: "warn", scope: "idempotency", msg: "idem set failed (continue)", event, idemKey, merchant: merchantId, orderId, meta: { err: String(e) } });
  }

  // (5) Main processing
  try {
    await fbLog(db, { level: "info", scope: "handler", msg: "processing start", event, idemKey, merchant: merchantId, orderId });

    // A) app.* (authorize/installed/updated) → flags/domain + oauth + userinfo
    if (event === "app.store.authorize" || event === "app.installed" || event === "app.updated") {
      const domainInPayload =
        (dataRaw["domain"] as string) ||
        (dataRaw["store_url"] as string) ||
        (dataRaw["url"] as string) ||
        (typeof dataRaw["store"] === "object" && dataRaw["store"] ? (dataRaw["store"] as UnknownRecord)["domain"] as string : undefined) ||
        (typeof dataRaw["store"] === "object" && dataRaw["store"] ? (dataRaw["store"] as UnknownRecord)["url"] as string : undefined) ||
        (typeof dataRaw["merchant"] === "object" && dataRaw["merchant"] ? (dataRaw["merchant"] as UnknownRecord)["domain"] as string : undefined) ||
        (typeof dataRaw["merchant"] === "object" && dataRaw["merchant"] ? (dataRaw["merchant"] as UnknownRecord)["url"] as string : undefined) ||
        null;

      const base = toDomainBase(domainInPayload);
      await fbLog(db, { level: "debug", scope: "domain", msg: "domain parsed", event, idemKey, merchant: merchantId, orderId, meta: { domainInPayload, base } });

      if (storeUid) {
        await fbLog(db, { level: "debug", scope: "store", msg: "saving flags/domain...", event, idemKey, merchant: merchantId, orderId, meta: { storeUid } });
        await saveDomainAndFlags(db, storeUid, merchantId, base, event);
        await fbLog(db, { level: "info", scope: "store", msg: "store saved", event, idemKey, merchant: merchantId, orderId, meta: { storeUid, base } });

        // OAuth (إن وُجد في authorize، اختياري في باقي الأحداث)
        const token   = String((dataRaw["access_token"] ??
                        (typeof dataRaw["token"] === "object" && dataRaw["token"]
                          ? (dataRaw["token"] as UnknownRecord)["access_token"] : "")) || "");
        const refresh = String((dataRaw["refresh_token"] ??
                        (typeof dataRaw["token"] === "object" && dataRaw["token"]
                          ? (dataRaw["token"] as UnknownRecord)["refresh_token"] : "")) || "");
        const expires = Number(dataRaw["expires"] ??
                        (typeof dataRaw["token"] === "object" && dataRaw["token"]
                          ? (dataRaw["token"] as UnknownRecord)["expires"] : 0));
        const scope   = String((dataRaw["scope"] ??
                        (typeof dataRaw["token"] === "object" && dataRaw["token"]
                          ? (dataRaw["token"] as UnknownRecord)["scope"] : "")) || "") || undefined;

        if (token) {
          await db.collection("owners").doc(storeUid).set({
            uid: storeUid, provider: "salla",
            oauth: {
              access_token: token,
              refresh_token: refresh || null,
              scope: scope || null,
              expires: Number.isFinite(expires) ? expires : null,
              receivedAt: Date.now(),
              strategy: "easy_mode",
            },
            updatedAt: Date.now(),
          }, { merge: true });
          await fbLog(db, { level: "info", scope: "oauth", msg: "owner oauth saved", event, idemKey, merchant: merchantId, orderId, meta: { storeUid, hasRefresh: !!refresh } });
        } else {
          await fbLog(db, { level: "debug", scope: "oauth", msg: "no access_token in payload (ok for installed/updated)", event, idemKey, merchant: merchantId, orderId });
        }

        // UserInfo (اختياري) — يثبت الدومين والاسم ويُخزَّن للمرجع
        try {
          const info = await fetchUserInfo(storeUid);
          await db.collection("stores").doc(storeUid).set({
            uid: storeUid, provider: "salla",
            meta: { userinfo: info, updatedAt: Date.now() },
            updatedAt: Date.now(),
          }, { merge: true });
          await fbLog(db, { level: "info", scope: "userinfo", msg: "userinfo saved", event, idemKey, merchant: merchantId, orderId, meta: { storeUid } });
        } catch (e) {
          await fbLog(db, { level: "warn", scope: "userinfo", msg: "userinfo fetch failed", event, idemKey, merchant: merchantId, orderId, meta: { err: e instanceof Error ? e.message : String(e) } });
        }
      } else {
        await fbLog(db, { level: "warn", scope: "store", msg: "missing storeUid (no merchantId)", event, idemKey, merchant: merchantId, orderId });
      }
    }

    // B) Subscription/Trial → set plan (إن أتت من سلة)
    if (event.startsWith("app.subscription.") || event.startsWith("app.trial.")) {
      const payload = dataRaw as UnknownRecord;
      const planName = String(payload["plan_name"] ?? payload["name"] ?? "").toLowerCase();
      const map: Record<string, string> = { start: "P30", growth: "P60", scale: "P120", elite: "ELITE", trial: "TRIAL" };
      const planId = (map[planName] || "").toUpperCase() || (event.includes(".trial.") ? "TRIAL" : "P30");

      if (storeUid) {
        await db.collection("stores").doc(storeUid).set({
          uid: storeUid,
          subscription: { planId, raw: payload, updatedAt: Date.now() },
          updatedAt: Date.now(),
        }, { merge: true });
        await fbLog(db, { level: "info", scope: "subscription", msg: "plan set", event, idemKey, merchant: merchantId, orderId, meta: { storeUid, planName, planId } });
      } else {
        await fbLog(db, { level: "warn", scope: "subscription", msg: "missing storeUid for subscription event", event, idemKey, merchant: merchantId, orderId, meta: { planName } });
      }
    }

    // C) Order/Shipment snapshot
    if (isOrderEvent) {
      const storeUidFromEvent = pickStoreUidFromSalla(dataRaw, body.merchant) || null;
      await upsertOrderSnapshot(db, asOrder, storeUidFromEvent);
      await fbLog(db, { level: "info", scope: "orders", msg: "order snapshot upserted", event, idemKey, merchant: merchantId, orderId, meta: { storeUidFromEvent } });
    }

    // D) Invites (paid/delivered)
    if (event === "order.payment.updated") {
      const ps = lc(asOrder.payment_status ?? "");
      if (["paid","authorized","captured"].includes(ps)) {
        await ensureInviteForOrder(db, asOrder, dataRaw, body.merchant);
        await fbLog(db, { level: "info", scope: "invite", msg: "invite ensured via payment", event, idemKey, merchant: merchantId, orderId, meta: { ps } });
      }
    } else if (event === "shipment.updated") {
      const st = lc(asOrder.status ?? asOrder.order_status ?? asOrder.new_status ?? asOrder.shipment_status ?? "");
      if (DONE.has(st) || ["delivered","completed"].includes(st)) {
        await ensureInviteForOrder(db, asOrder, dataRaw, body.merchant);
        await fbLog(db, { level: "info", scope: "invite", msg: "invite ensured via shipment", event, idemKey, merchant: merchantId, orderId, meta: { st } });
      }
    } else if (event === "order.status.updated") {
      const st = lc(asOrder.status ?? asOrder.order_status ?? asOrder.new_status ?? asOrder.shipment_status ?? "");
      if (DONE.has(st)) {
        await ensureInviteForOrder(db, asOrder, dataRaw, body.merchant);
        await fbLog(db, { level: "info", scope: "invite", msg: "invite ensured via order status", event, idemKey, merchant: merchantId, orderId, meta: { st } });
      }
    } else if (event === "order.cancelled" || event === "order.refunded") {
      const oid = String(asOrder.id ?? asOrder.order_id ?? "");
      if (oid) {
        const q = await db.collection("review_tokens").where("orderId","==",oid).get();
        if (!q.empty) {
          const reason = event === "order.cancelled" ? "order_cancelled" : "order_refunded";
          const batch = db.batch(); q.docs.forEach((d)=>batch.update(d.ref, { voidedAt: Date.now(), voidReason: reason }));
          await batch.commit();
          await fbLog(db, { level: "info", scope: "invite", msg: "tokens voided", event, idemKey, merchant: merchantId, orderId: oid, meta: { count: q.docs.length, reason } });
        }
      }
    }

    // E) processed + known/unhandled logs
    const orderIdFin = isOrderEvent
      ? (String(asOrder.id ?? asOrder.order_id ?? "") || "none")
      : "none";
    const statusFin = lc(asOrder.status ?? asOrder.order_status ?? asOrder.new_status ?? asOrder.shipment_status ?? "");

    await db.collection("processed_events").doc(keyOf(event, orderIdFin, statusFin)).set({
      at: Date.now(), event, processed: true, status: statusFin
    }, { merge: true });

    const knownPrefixes = ["order.","shipment.","product.","customer.","category.","brand.","store.","cart.","invoice.","specialoffer.","app."];
    const isKnown = knownPrefixes.some((p)=>event.startsWith(p)) || event === "review.added";
    await db.collection(isKnown ? "webhooks_salla_known" : "webhooks_salla_unhandled")
      .add({ at: Date.now(), event, data: dataRaw }).catch(()=>{});

    await fbLog(db, { level: "info", scope: "handler", msg: "processing finished ok", event, idemKey, merchant: merchantId, orderId });
    await idemRef.set({ statusFlag: "done", processingFinishedAt: Date.now() }, { merge: true });

  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    await fbLog(db, { level: "error", scope: "handler", msg: "processing failed", event, idemKey, merchant: merchantId, orderId, meta: { err } });
    await db.collection("webhook_errors").add({
      at: Date.now(), scope: "handler", event, error: err, raw: raw.toString("utf8").slice(0, 2000)
    }).catch(()=>{});
    await idemRef.set({ statusFlag: "failed", lastError: err, processingFinishedAt: Date.now() }, { merge: true });
  }
}
