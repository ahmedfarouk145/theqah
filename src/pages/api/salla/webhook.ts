// src/pages/api/salla/webhook.ts
import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import { dbAdmin } from "@/lib/firebaseAdmin";
import { fetchStoreInfo, fetchUserInfo, getOwnerAccessToken } from "@/lib/sallaClient";
import { canSendInvite, onInviteSent } from "@/server/subscription/usage";
import { sendPasswordSetupEmail } from "@/server/auth/send-password-email";
import { sendBothNow } from "@/server/messaging/send-invite";

export const runtime = "nodejs";
export const config = { api: { bodyParser: false } };

/* ===================== Types ===================== */
type Dict = Record<string, unknown>;

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
  data?: SallaOrder | Dict;
  created_at?: string;
}

/* ===================== Env ===================== */
const WEBHOOK_SECRET = (process.env.SALLA_WEBHOOK_SECRET || "").trim();
const WEBHOOK_TOKEN  = (process.env.SALLA_WEBHOOK_TOKEN  || "").trim();
const APP_BASE_URL   = (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || "").replace(/\/+$/,"");
const WEBHOOK_LOG_DEST = (process.env.WEBHOOK_LOG_DEST || "console").trim().toLowerCase(); // console | firestore

/* ===================== Utils ===================== */
const lc = (x: unknown) => String(x ?? "").toLowerCase();
const DONE = new Set(["paid","fulfilled","delivered","completed","complete","تم التوصيل","مكتمل","تم التنفيذ"]);

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
function validEmailOrPhone(c?: SallaCustomer) {
  const email = c?.email?.trim(); const mobile = c?.mobile?.trim();
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
    customer: { name: order.customer?.name ?? null, email: order.customer?.email ?? null, mobile: order.customer?.mobile ?? null },
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
  const orderId = String(order.id ?? order.order_id ?? "");
  if (!orderId) return;

  let customer = order.customer as SallaCustomer | undefined;
  if (!customer?.email && !customer?.mobile) customer = (rawData["customer"] as SallaCustomer) || customer;
  if ((!customer?.email && !customer?.mobile) && rawData["order"] && typeof rawData["order"] === "object") {
    customer = (rawData["order"] as Dict)["customer"] as SallaCustomer || customer;
  }
  const cv = validEmailOrPhone(customer);
  if (!cv.ok) return;

  const exists = await db.collection("review_invites").where("orderId", "==", orderId).limit(1).get();
  if (!exists.empty) return;

  let storeUid: string|null = pickStoreUidFromSalla(rawData, bodyMerchant) || null;
  if (!storeUid) {
    const orderDoc = await db.collection("orders").doc(orderId).get().catch(() => null);
    storeUid = (orderDoc?.data() as Dict | undefined)?.["storeUid"] as string | null ?? null;
  }

  // فحص الخطة (لو عندك usage limits)
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

  // ——— إرسال فوري عبر الـ sender القديم بتاعك
  const storeName = getStoreOrMerchantName(rawData) ?? "متجرك";
  await sendBothNow({
    inviteId: tokenId,
    phone: cv.mobile,
    email: cv.email,
    customerName: customer?.name,
    storeName,
    url: publicUrl,
    perChannelTimeoutMs: 15000,
  });

  if (storeUid) await onInviteSent(storeUid);
}

/* ===================== Handler ===================== */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const raw = await readRawBody(req);
  const db = dbAdmin();

  // (1) Security check + basic log row
  const verification = verifySallaRequest(req, raw);
  await fbLog(db, {
    level: verification.ok ? "info" : "warn",
    scope: "auth",
    msg: verification.ok ? "verification ok" : "verification failed",
    event: null, idemKey: null, merchant: null, orderId: null,
    meta: {
      strategyHeader: getHeader(req, "x-salla-security-strategy") || "auto",
      hasSecret: !!WEBHOOK_SECRET, hasToken: !!WEBHOOK_TOKEN,
      sigLen: (getHeader(req, "x-salla-signature") || "").length,
      from: req.headers["x-forwarded-for"] || req.socket.remoteAddress
    }
  });
  if (!verification.ok) return res.status(401).json({ error: "unauthorized" });

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
      const payloadDomainGeneric =
        (typeof (dataRaw["store"] as Dict | undefined)?.["domain"] === "string" ? ((dataRaw["store"] as Dict)["domain"] as string) : undefined) ??
        (typeof (dataRaw["merchant"] as Dict | undefined)?.["domain"] === "string" ? ((dataRaw["merchant"] as Dict)["domain"] as string) : undefined) ??
        (typeof dataRaw["domain"] === "string" ? (dataRaw["domain"] as string) : undefined) ??
        (typeof dataRaw["store_url"] === "string" ? (dataRaw["store_url"] as string) : undefined) ??
        (typeof dataRaw["url"] === "string" ? (dataRaw["url"] as string) : undefined);

      const baseGeneric = toDomainBase(payloadDomainGeneric);
      if (storeUidFromEvent && baseGeneric) {
        const keyGeneric = encodeUrlForFirestore(baseGeneric);
        const existsGeneric = await db.collection("domains").doc(keyGeneric).get().then(d => d.exists).catch(() => false);
        if (!existsGeneric) {
          await saveDomainAndFlags(db, storeUidFromEvent, merchantId, baseGeneric, event);
          await saveMultipleDomainFormats(db, storeUidFromEvent, payloadDomainGeneric);
          await fbLog(db, { level: "info", scope: "domain", msg: "auto-saved domain from event payload", event, idemKey, merchant: merchantId, orderId, meta: { base: baseGeneric, storeUid: storeUidFromEvent } });
        }
      }
    } catch (e) {
      await fbLog(db, { level: "warn", scope: "domain", msg: "auto-save domain failed", event, idemKey, merchant: merchantId, orderId, meta: { err: e instanceof Error ? e.message : String(e) } });
    }

    // A) authorize/installed/updated → flags/domain + oauth + store/info + userinfo + password email
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
        await saveDomainAndFlags(db, storeUid, merchantId, base, event);
        // Also save multiple domain formats for better resolution
        await saveMultipleDomainFormats(db, storeUid, domainInPayload);
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

    // B) Subscription/Trial → set plan
    if (event.startsWith("app.subscription.") || event.startsWith("app.trial.")) {
      const storeUid = merchantId != null ? `salla:${String(merchantId)}` : undefined;
      const payload = dataRaw as Dict;
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
    if (event.startsWith("order.") || event.startsWith("shipment.")) {
      const storeUidFromEvent = pickStoreUidFromSalla(dataRaw, body.merchant) || null;
      await upsertOrderSnapshot(db, asOrder, storeUidFromEvent);
      await fbLog(db, { level: "info", scope: "orders", msg: "order snapshot upserted", event, idemKey, merchant: merchantId, orderId, meta: { storeUidFromEvent } });
    }

    // D) Invites (paid/delivered) + void on cancel/refund
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
      const oid = orderId;
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
    const orderIdFin = orderId ?? "none";
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
    try { res.status(200).json({ ok: true }); } catch {}

  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    
    // Enhanced error logging with stack trace
    console.error(`[SALLA WEBHOOK ERROR] Event: ${event}, OrderId: ${orderId}, Merchant: ${merchantId}`);
    console.error(`[SALLA WEBHOOK ERROR] Error: ${err}`);
    if (stack) console.error(`[SALLA WEBHOOK ERROR] Stack: ${stack}`);
    
    await fbLog(db, { 
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
    await db.collection("webhook_errors").add({
      at: Date.now(), scope: "handler", event, orderId: orderId || "unknown", merchantId, 
      error: err, stack: stack?.substring(0, 1000), 
      raw: raw.toString("utf8").slice(0, 2000),
      debugData: {
        hasCustomerData: !!((dataRaw as Record<string, unknown>).customer || ((dataRaw as Record<string, unknown>).order as Record<string, unknown>)?.customer),
        hasProductData: !!((dataRaw as Record<string, unknown>).items || ((dataRaw as Record<string, unknown>).order as Record<string, unknown>)?.items),
        dataKeys: Object.keys(dataRaw as Record<string, unknown>)
      }
    }).catch(()=>{});
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

  if (WEBHOOK_LOG_DEST === "firestore") {
    try { 
      await Promise.race([
        db.collection("webhook_firebase").add(payload),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Log timeout')), 2500))
      ]);
    } catch { 
      // Silently skip Firebase logging on timeout - not critical for functionality
      console.warn("[WEBHOOK_LOG][TIMEOUT]", entry.level, entry.scope); 
    }
  }

  const lineObj = { event: payload.event, merchant: payload.merchant, orderId: payload.orderId, idemKey: payload.idemKey };
  const line = `[${entry.level.toUpperCase()}][${entry.scope}] ${entry.msg} :: ${JSON.stringify(lineObj)}`;
  if (entry.level === "error" || entry.level === "warn") console.error(line); else console.log(line);
}
