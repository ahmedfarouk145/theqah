// src/pages/api/salla/webhook.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";
import { fetchStoreInfo, fetchUserInfo, getOwnerAccessToken } from "@/lib/sallaClient";
import { sendPasswordSetupEmail } from "@/server/auth/send-password-email";
import { trackWebhook } from "@/server/monitoring/metrics";
import { moderateReview } from "@/server/moderation";
import { SallaWebhookService } from "@/server/services/salla-webhook.service";

// Extracted types and utilities
import type { Dict, SallaOrder, SallaWebhookBody } from "@/server/types/salla-webhook.types";
import {
  lc,
  getHeader,
  readRawBody,
  verifySallaRequest,
  toDomainBase,
  normalizeUrl,
  encodeUrlForFirestore,
  pickStoreUidFromSalla,
  keyOf,
  generateIdempotencyKey,
} from "@/server/utils/salla-webhook.utils";
import { fbLog } from "@/server/utils/salla-webhook.logger";

export const runtime = "nodejs";
export const config = { api: { bodyParser: false } };

/* ===================== Env ===================== */
const WEBHOOK_SECRET = (process.env.SALLA_WEBHOOK_SECRET || "").trim();
const WEBHOOK_TOKEN = (process.env.SALLA_WEBHOOK_TOKEN || "").trim();
const isDevelopment = process.env.NODE_ENV === "development";

/* ===================== Domain Helpers (to be moved to service later) ===================== */
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
    origin,
    hostname,
  ];

  if (firstSeg.startsWith("dev-")) {
    domainsToSave.push(`${origin}/${firstSeg}`, `${hostname}/${firstSeg}`);
  }

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
  }).catch(() => { });
}

/* ===================== Handler ===================== */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const webhookStartTime = Date.now();
  const raw = await readRawBody(req);
  const db = dbAdmin();
  const sallaService = new SallaWebhookService();

  // (1) Security check + basic log row (C8: Auth bypass removed)
  const verification = verifySallaRequest(req, raw);

  await fbLog(db, {
    level: verification.ok ? "info" : "warn",
    scope: "auth",
    msg: verification.ok ? "verification ok" : "verification failed",
    event: null, idemKey: null, merchant: null, orderId: null,
    meta: {
      strategyHeader: getHeader(req, "x-salla-security-strategy") || "auto",
      hasSecret: !!WEBHOOK_SECRET,
      hasToken: !!WEBHOOK_TOKEN,
      sigLen: (getHeader(req, "x-salla-signature") || "").length,
      from: req.headers["x-forwarded-for"] || req.socket.remoteAddress,
      nodeEnv: process.env.NODE_ENV,
      host: req.headers.host
    }
  });

  if (!verification.ok) return res.status(401).json({ error: "unauthorized" });

  // (2) Proceed synchronously (no early ACK). Vercel Node runtime may stop work after responding.

  // (3) Parse body
  let body: SallaWebhookBody = { event: "" };
  try {
    body = JSON.parse(raw.toString("utf8") || "{}");
  } catch (e) {
    await fbLog(db, {
      level: "error", scope: "parse", msg: "invalid json", event: null, idemKey: null, merchant: null, orderId: null,
      meta: { err: e instanceof Error ? e.message : String(e), rawFirst2000: raw.toString("utf8").slice(0, 2000) }
    });
    await db.collection("webhook_errors").add({
      at: Date.now(), scope: "parse", error: e instanceof Error ? e.message : String(e),
      raw: raw.toString("utf8").slice(0, 2000), headers: req.headers
    }).catch((err) => {
      console.error('[Webhook] Failed to log parse error:', err);
    });
    return;
  }

  const event = String(body.event || "");
  const dataRaw = (body.data ?? {}) as Dict;
  const asOrder = dataRaw as SallaOrder;

  // Use reference_id (visible order number) for consistency with Salla API
  const orderId = (() => {
    const v = asOrder?.reference_id ?? asOrder?.id ?? asOrder?.order_id;
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
  const idemKey = generateIdempotencyKey(sigHeader, raw);
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
        await sallaService.handleAppAuthorize(storeUid, tokenFromPayload, refresh || undefined, scopeStr || undefined, Number.isFinite(expires) ? expires : undefined);
        await fbLog(db, { level: "info", scope: "oauth", msg: "owner oauth saved via service", event, idemKey, merchant: merchantId, orderId, meta: { storeUid, hasRefresh: !!refresh } });
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
                }).catch((err) => {
                  console.error('[Webhook] Failed to update order stats:', err);
                });
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
      const storeUid = merchantId != null ? `salla:${String(merchantId)}` : undefined;
      const payload = dataRaw as Dict;

      // Handle expired/cancelled subscriptions AND trial expiry
      if (event === "app.subscription.expired" || event === "app.subscription.cancelled" || event === "app.trial.expired") {
        if (storeUid) {
          await sallaService.handleSubscriptionExpired(storeUid, payload);

          fbLog(db, {
            level: "info",
            scope: "subscription",
            msg: `subscription ${event.includes('expired') ? 'expired' : 'cancelled'}`,
            event,
            idemKey,
            merchant: merchantId,
            orderId,
            meta: { storeUid }
          });
        }
      } else if (event === "app.trial.started") {
        // Trial started - set to TRIAL plan
        if (storeUid) {
          const startedAtPayload =
            payload["start_date"] ?? payload["started_at"] ?? payload["created_at"];
          const startedAt = startedAtPayload ? new Date(String(startedAtPayload)).getTime() : Date.now();

          await sallaService.handleTrialStarted(storeUid, startedAt, payload);

          fbLog(db, {
            level: "info",
            scope: "subscription",
            msg: "trial started",
            event,
            idemKey,
            merchant: merchantId,
            orderId,
            meta: { storeUid }
          });
        }
      } else {
        // Handle started/renewed subscriptions (paid plans)
        const planName =
          String(payload["plan_name"] ?? payload["name"] ?? payload["plan"] ?? "").trim() ||
          (typeof payload["plan"] === "object" ? String((payload["plan"] as Dict)["name"] ?? "").trim() : "");
        const planType = String(payload["plan_type"] ?? payload["type"] ?? "").trim() || null;

        const { mapSallaPlanToInternal } = await import("@/config/plans");
        // If plan_name is empty, default to the billing cycle or TRIAL
        const planId = planName ? mapSallaPlanToInternal(planName, planType as 'monthly' | 'annual' | null) : "TRIAL";

        if (storeUid && planId) {
          const startedAtPayload =
            payload["start_date"] ?? payload["started_at"] ?? payload["created_at"];
          const startedAt = startedAtPayload ? new Date(String(startedAtPayload)).getTime() : Date.now();

          await sallaService.handleSubscriptionEvent(storeUid, planId, startedAt, payload);

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
        // Type assertion needed due to reference_id type difference (string | number vs string)
        await sallaService.handleOrderCreated(asOrder as Parameters<typeof sallaService.handleOrderCreated>[0], storeUidFromEvent || '');
        fbLog(db, { level: "info", scope: "orders", msg: "order snapshot upserted via service", event, idemKey, merchant: merchantId, orderId, meta: { storeUidFromEvent } });
      } catch (err) {
        console.error(`[ORDER_SNAPSHOT_ERROR] Failed to upsert order ${orderId}:`, err);
        fbLog(db, { level: "error", scope: "orders", msg: "order snapshot failed", event, idemKey, merchant: merchantId, orderId, meta: { error: (err as Error).message } });
        throw err; // Re-throw to trigger main catch block
      }
    }

    // D) Order status events - invite system disabled (using Salla Reviews API)
    if (event === "order.updated" || event === "order.status.updated") {
      // Note: Invite system disabled - reading reviews directly from Salla API
      fbLog(db, { level: "debug", scope: "order", msg: "order status updated", event, idemKey, merchant: merchantId, orderId });
    } else if (event === "order.cancelled" || event === "order.refunded") {
      const oid = orderId;
      if (oid) {
        const reason = event === "order.cancelled" ? "order_cancelled" : "order_refunded";
        const count = await sallaService.handleOrderCancelled(oid, reason);
        if (count > 0) {
          fbLog(db, { level: "info", scope: "invite", msg: "tokens voided via service", event, idemKey, merchant: merchantId, orderId: oid, meta: { count, reason } });
        }
      }
    } else if (event === "review.added") {
      // Save review immediately from webhook (don't wait for Salla API indexing)
      const storeUid = merchantId != null ? `salla:${String(merchantId)}` : undefined;
      if (storeUid && dataRaw && typeof dataRaw === 'object') {
        try {
          const reviewData = dataRaw as Record<string, unknown>;
          const reviewType = String(reviewData.type || "");
          const product = reviewData.product as Record<string, unknown> | undefined;
          const order = reviewData.order as Record<string, unknown> | undefined;
          const customer = reviewData.customer as Record<string, unknown> | undefined;
          const productId = product?.id;

          // Use internal 'id' for orderId to match Salla API response (which returns internal IDs in order_id field)
          // Use 'reference_id' for display purposes as orderNumber
          const sallaOrderId = String(order?.id || order?.order_id || "");
          const sallaReferenceId = String(order?.reference_id || "");

          // Primary ID for matching with API must be the internal one
          const orderId = sallaOrderId || sallaReferenceId;


          // Skip testimonials (store reviews) - we only track product reviews
          if (reviewType === "testimonial" || !product) {
            fbLog(db, { level: "info", scope: "review", msg: "skipping testimonial review", event, idemKey, merchant: merchantId });
            return res.status(200).json({ ok: true, processed: true });
          }

          if (!productId || !orderId) {
            fbLog(db, { level: "warn", scope: "review", msg: "missing product or order id", event, idemKey, merchant: merchantId, meta: { type: reviewType, hasProduct: !!product, hasOrder: !!order } });
            return res.status(200).json({ ok: true, processed: true });
          }

          // Check if already exists (using orderId + productId)
          const existingQuery = await db.collection("reviews")
            .where("storeUid", "==", storeUid)
            .where("orderId", "==", String(orderId))
            .where("productId", "==", String(productId))
            .limit(1)
            .get();

          if (!existingQuery.empty) {
            fbLog(db, { level: "info", scope: "review", msg: "review already exists", event, idemKey, merchant: merchantId, meta: { orderId, productId } });
            return res.status(200).json({ ok: true, processed: true });
          }

          // Get store subscription info for verification
          const storeSnap = await db.collection("stores").doc(storeUid).get();
          const storeData = storeSnap.data();
          const subscription = storeData?.subscription || {};
          const subscriptionStart = subscription.startedAt || 0;

          const orderDate = order?.date as Record<string, unknown> | undefined;
          const reviewDate = orderDate?.date && typeof orderDate.date === 'string'
            ? new Date(orderDate.date).getTime()
            : Date.now();
          const isVerified = subscriptionStart > 0 && reviewDate >= subscriptionStart;

          // Create doc ID using order + product (we'll update with sallaReviewId later if needed)
          const docId = `salla_${merchantId}_order_${orderId}_product_${productId}`;

          // ✅ Content moderation check
          const reviewText = String(reviewData.content || "");
          let reviewStatus = "approved";
          let moderationFlags: string[] = [];
          let needsManualReview = false;

          if (reviewText.trim()) {
            try {
              const modResult = await moderateReview({
                text: reviewText,
                stars: Number(reviewData.rating || 0),
                costSaving: true // Use cost-saving mode for webhook (high volume)
              });

              if (!modResult.ok) {
                reviewStatus = "pending_review";
                moderationFlags = modResult.flags || [];
                needsManualReview = true;
                console.log(`[MODERATION] Review flagged: ${docId}, reason: ${modResult.reason}, flags: ${moderationFlags.join(', ')}`);
              }
            } catch (modError) {
              console.error(`[MODERATION] Error checking review ${docId}:`, modError);
              // Continue without moderation if it fails
            }
          }

          // Save review with moderation-aware status
          const reviewDoc = {
            reviewId: docId,
            storeUid,
            orderId: String(orderId),
            orderNumber: sallaReferenceId || String(orderId), // Visible order number for UI
            productId: String(productId),
            source: "salla_native",

            productName: String(product?.name || ""),

            stars: Number(reviewData.rating || 0),
            text: reviewText,

            author: {
              displayName: String(customer?.name || "عميل سلة"),
              email: String(customer?.email || ""),
              mobile: String(customer?.mobile || ""),
            },

            status: reviewStatus,
            trustedBuyer: false,
            verified: isVerified,
            publishedAt: reviewDate,
            createdAt: Date.now(),
            updatedAt: Date.now(),

            // Moderation info
            ...(needsManualReview && {
              moderation: {
                flagged: true,
                flags: moderationFlags,
                checkedAt: Date.now(),
              }
            }),

            // sallaReviewId will be added by background job later
            needsSallaId: true, // Flag for background processing
          };

          await db.collection("reviews").doc(docId).set(reviewDoc);

          fbLog(db, { level: "info", scope: "review", msg: "review saved from webhook", event, idemKey, merchant: merchantId, meta: { orderId, productId, verified: isVerified, status: reviewStatus, flagged: needsManualReview } });


          // Trigger background job to fetch sallaReviewId (fire-and-forget)
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${req.headers.host}`;
          const jobUrl = `${appUrl}/api/jobs/fetch-review-id`;

          console.log(`[BACKGROUND_JOB] Triggering job for review ${docId} at ${jobUrl}`);

          // Note: We don't await this so webhook responds immediately
          // The background job runs independently with its own retry logic
          fetch(jobUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.CRON_SECRET}`,
            },
            body: JSON.stringify({
              reviewDocId: docId,
              merchantId,
              orderId: String(orderId),
            }),
          }).catch((err) => {
            console.error('[BACKGROUND_JOB] Failed to trigger:', err);
            // Non-blocking: job will be picked up by hourly cron backup
          });

        } catch (syncErr) {
          const errMsg = syncErr instanceof Error ? syncErr.message : String(syncErr);
          fbLog(db, { level: "error", scope: "review", msg: "review save exception", event, idemKey, merchant: merchantId, meta: { error: errMsg } });
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
      new Promise<void>((_resolve, reject) => {
        void _resolve;
        setTimeout(() => reject(new Error("processed_events_timeout")), 2000);
      })
    ]).catch((err) => {
      console.error('[Webhook] Failed to mark event as processed:', err);
    });

    const knownPrefixes = ["order.", "shipment.", "product.", "customer.", "category.", "brand.", "store.", "cart.", "invoice.", "specialoffer.", "app."];
    const isKnown = knownPrefixes.some((p) => event.startsWith(p)) || event === "review.added";
    Promise.race([
      db.collection(isKnown ? "webhooks_salla_known" : "webhooks_salla_unhandled")
        .add({ at: Date.now(), event, data: dataRaw }),
      new Promise<void>((_resolve, reject) => {
        void _resolve;
        setTimeout(() => reject(new Error("webhooks_salla_timeout")), 2000);
      })
    ]).catch((err) => {
      console.error('[Webhook] Failed to log webhook event:', err);
    });

    fbLog(db, { level: "info", scope: "handler", msg: "processing finished ok", event, idemKey, merchant: merchantId, orderId });
    await idemRef.set({ statusFlag: "done", processingFinishedAt: Date.now() }, { merge: true });

    // Track successful webhook
    const storeUid = merchantId != null ? `salla:${String(merchantId)}` : undefined;
    trackWebhookCompletion(event, storeUid, true, Date.now() - webhookStartTime);

    try { res.status(200).json({ ok: true }); } catch { }

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
      new Promise<void>((_resolve, reject) => {
        void _resolve;
        setTimeout(() => reject(new Error("webhook_errors_timeout")), 3000);
      })
    ]).catch(() => { });

    // Enqueue for retry (H6: Webhook retry logic)
    try {
      const { enqueueWebhookRetry } = await import("@/server/queue/webhook-retry");
      const storeUid = pickStoreUidFromSalla(dataRaw, body.merchant);

      await enqueueWebhookRetry({
        event,
        merchant: merchantId,
        orderId,
        rawBody: raw,
        headers: Object.fromEntries(
          Object.entries(req.headers).filter(([, v]) => v !== undefined)
        ) as Record<string, string | string[]>,
        error: e instanceof Error ? e : new Error(String(e)),
        storeUid,
        priority: event.includes("order") ? "high" : "normal",
      });

      console.log(`[WEBHOOK] Enqueued for retry: ${event} (orderId: ${orderId})`);
    } catch (retryErr) {
      console.error(`[WEBHOOK] Failed to enqueue retry:`, retryErr);
    }

    await idemRef.set({ statusFlag: "failed", lastError: err, processingFinishedAt: Date.now(), errorStack: stack?.substring(0, 500) }, { merge: true });
    try { res.status(500).json({ ok: false, error: err }); } catch { }
  }
}

/* ===================== Helper Functions ===================== */
// Track webhook completion at the end of handler
function trackWebhookCompletion(event: string, storeUid: string | undefined, success: boolean, duration: number, error?: string) {
  trackWebhook({
    event,
    storeUid,
    success,
    duration,
    error
  }).catch((err) => {
    console.error('[Webhook] Failed to track webhook completion:', err);
  });
}
