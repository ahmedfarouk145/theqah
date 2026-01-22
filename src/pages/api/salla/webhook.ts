// src/pages/api/salla/webhook.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";
import { fetchStoreInfo, fetchUserInfo, fetchMerchantInfo, getOwnerAccessToken } from "@/lib/sallaClient";
import { sendPasswordSetupEmail } from "@/server/auth/send-password-email";
import { trackWebhook } from "@/server/monitoring/metrics";
import { SallaWebhookService } from "@/server/services/salla-webhook.service";

// Extracted types and utilities
import type { Dict, SallaOrder, SallaWebhookBody } from "@/server/types/salla-webhook.types";
import {
  lc,
  getHeader,
  readRawBody,
  verifySallaRequest,
  toDomainBase,
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

// C7: Safer signature bypass - requires explicit opt-in AND non-production
// Production always validates signatures, regardless of any env vars
const SKIP_SIGNATURE_CHECK =
  process.env.SKIP_WEBHOOK_SIGNATURE === "true" &&
  process.env.NODE_ENV !== "production";

/* ===================== Domain functions moved to SallaWebhookService ===================== */
// saveDomainAndFlags → sallaService.saveDomainWithFlags()
// saveMultipleDomainFormats → sallaService.saveDomainVariations()


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

      // FORCE SAVE if we have storeUidFromEvent but no domain - try to fetch it
      if (storeUidFromEvent && !baseGeneric && merchantId) {
        // C3 FIX: Skip API call if SALLA_APP_TOKEN is not configured (instead of using 'dummy')
        const sallaAppToken = process.env.SALLA_APP_TOKEN?.trim();
        if (!sallaAppToken) {
          await fbLog(db, {
            level: "warn",
            scope: "domain",
            msg: "SALLA_APP_TOKEN not configured - skipping store info fetch",
            event, idemKey, merchant: merchantId, orderId
          });
        } else {
          try {
            const storeInfoUrl = `https://api.salla.dev/admin/v2/store`;
            const response = await fetch(storeInfoUrl, {
              headers: {
                'Authorization': `Bearer ${sallaAppToken}`,
                'Content-Type': 'application/json'
              }
            });

            if (response.ok) {
              const storeInfo = await response.json();
              const fetchedDomain = storeInfo?.data?.domain || storeInfo?.domain;
              if (fetchedDomain) {
                await sallaService.saveDomainWithFlags(storeUidFromEvent, merchantId, fetchedDomain, event);
                await sallaService.saveDomainVariations(storeUidFromEvent, fetchedDomain);
                await fbLog(db, { level: "info", scope: "domain", msg: "fetched and saved domain via service", event, idemKey, merchant: merchantId, orderId, meta: { domain: fetchedDomain, storeUid: storeUidFromEvent } });
                return; // Exit early after successful fetch
              }
            }
          } catch {
            // Silent fail - domain fetch is optional
          }
        }
      }

      if (storeUidFromEvent && baseGeneric) {
        const keyGeneric = encodeUrlForFirestore(baseGeneric);
        const existsGeneric = await db.collection("domains").doc(keyGeneric).get().then(d => d.exists).catch(() => false);
        if (!existsGeneric) {
          await sallaService.saveDomainWithFlags(storeUidFromEvent, merchantId, baseGeneric, event);
          await sallaService.saveDomainVariations(storeUidFromEvent, payloadDomainGeneric);
          await fbLog(db, { level: "info", scope: "domain", msg: "auto-saved domain via service", event, idemKey, merchant: merchantId, orderId, meta: { base: baseGeneric, storeUid: storeUidFromEvent } });
        }
      }
    } catch (e) {
      await fbLog(db, { level: "warn", scope: "domain", msg: "auto-save domain failed", event, idemKey, merchant: merchantId, orderId, meta: { err: e instanceof Error ? e.message : String(e) } });
    }

    // A) authorize/installed/updated → flags/domain + oauth + store/info + userinfo + password email
    if (event === "app.store.authorize" || event === "app.updated" || event === "app.installed") {
      const storeUid = merchantId != null ? `salla:${String(merchantId)}` : undefined;

      // DEBUG: Log full payload structure to understand what Salla sends
      await fbLog(db, {
        level: "debug",
        scope: "payload_debug",
        msg: "full payload keys for authorize/install",
        event,
        idemKey,
        merchant: merchantId,
        orderId,
        meta: {
          topLevelKeys: Object.keys(body),
          dataKeys: Object.keys(dataRaw),
          hasOwner: !!dataRaw['owner'],
          hasMerchant: !!dataRaw['merchant'],
          hasStore: !!dataRaw['store'],
          hasUser: !!dataRaw['user'],
          ownerEmail: (dataRaw['owner'] as Dict)?.['email'] ?? null,
          merchantEmail: (dataRaw['merchant'] as Dict)?.['email'] ?? null,
          storeEmail: (dataRaw['store'] as Dict)?.['email'] ?? null,
          userEmail: (dataRaw['user'] as Dict)?.['email'] ?? null,
          bodyEmail: ((body as unknown) as Dict)?.['email'] ?? null,
        }
      });

      // Try to extract email from multiple possible locations in the payload
      const payloadEmail =
        (typeof (dataRaw['owner'] as Dict)?.['email'] === 'string' ? (dataRaw['owner'] as Dict)['email'] as string : undefined) ??
        (typeof (dataRaw['merchant'] as Dict)?.['email'] === 'string' ? (dataRaw['merchant'] as Dict)['email'] as string : undefined) ??
        (typeof (dataRaw['user'] as Dict)?.['email'] === 'string' ? (dataRaw['user'] as Dict)['email'] as string : undefined) ??
        (typeof (dataRaw['store'] as Dict)?.['email'] === 'string' ? (dataRaw['store'] as Dict)['email'] as string : undefined) ??
        (typeof dataRaw['email'] === 'string' ? dataRaw['email'] as string : undefined) ??
        (typeof ((body as unknown) as Dict)['email'] === 'string' ? ((body as unknown) as Dict)['email'] as string : undefined);

      // Extract store name from payload
      const storeNameFromPayload =
        (typeof (dataRaw['store'] as Dict)?.['name'] === 'string' ? (dataRaw['store'] as Dict)['name'] as string : undefined) ??
        (typeof (dataRaw['merchant'] as Dict)?.['name'] === 'string' ? (dataRaw['merchant'] as Dict)['name'] as string : undefined) ??
        (typeof dataRaw['name'] === 'string' ? dataRaw['name'] as string : undefined);

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
        await sallaService.saveDomainWithFlags(storeUid, merchantId, base, event);
        await sallaService.saveDomainVariations(storeUid, domainInPayload);

        // Save store owner info if available from payload
        if (payloadEmail || storeNameFromPayload) {
          await db.collection("stores").doc(storeUid).set({
            meta: {
              ownerEmail: payloadEmail ?? null,
              storeName: storeNameFromPayload ?? null,
              payloadExtractedAt: Date.now(),
            }
          }, { merge: true });
          await fbLog(db, {
            level: "info",
            scope: "payload_extract",
            msg: "extracted owner info from payload",
            event, idemKey, merchant: merchantId, orderId,
            meta: { email: payloadEmail, storeName: storeNameFromPayload }
          });
        }
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
              await sallaService.saveDomainWithFlags(storeUid, merchantId, base, event);
              await sallaService.saveDomainVariations(storeUid, d);
              await fbLog(db, { level: "info", scope: "domain", msg: "domain saved via service", event, idemKey, merchant: merchantId, orderId, meta: { base } });
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

      // userinfo + merchantinfo (parallel) + حفظ + إيميل تعيين كلمة المرور + تحسين الدومين لو أمكن
      if (storeUid) {
        const token = tokenFromPayload || (await getOwnerAccessToken(db, storeUid)) || "";
        if (token) {
          try {
            // Fetch userinfo and merchant info in parallel (no extra latency!)
            const [uinfo, merchantData] = await Promise.all([
              fetchUserInfo(token),
              fetchMerchantInfo(token).catch((e) => {
                // Log error but don't fail - merchant API is optional
                fbLog(db, { level: "warn", scope: "merchant", msg: "merchant fetch failed", event, idemKey, merchant: merchantId, orderId, meta: { err: e instanceof Error ? e.message : String(e) } });
                return null;
              }),
            ]);

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

            // Extract email from multiple sources (priority order)
            const infoEmail =
              (typeof u.email === "string" ? u.email as string : undefined) ??
              (typeof u.merchant === "object" && typeof (u.merchant as Dict).email === "string" ? (u.merchant as Dict).email as string : undefined) ??
              (typeof u.user === "object" && typeof (u.user as Dict).email === "string" ? (u.user as Dict).email as string : undefined);

            // NEW: Get email from merchant API (highest priority)
            const merchantEmail = merchantData?.data?.email;

            const storeName =
              (typeof u.merchant === "object" && typeof (u.merchant as Dict).name === "string" ? (u.merchant as Dict).name as string : undefined) ??
              (typeof u.store === "object" && typeof (u.store as Dict).name === "string" ? (u.store as Dict).name as string : undefined) ??
              (merchantData?.data?.name) ?? // Fallback to merchant API name
              "متجرك";

            const payloadEmail = typeof (dataRaw as Dict)["email"] === "string" ? ((dataRaw as Dict)["email"] as string) : undefined;

            // Priority: Merchant API > UserInfo > Payload
            const targetEmail = merchantEmail || infoEmail || payloadEmail;

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
                await fbLog(db, { level: "info", scope: "password_email", msg: "sent ok", event, idemKey, merchant: merchantId, orderId, meta: { storeUid, targetEmail, source: merchantEmail ? "merchant_api" : infoEmail ? "userinfo" : "payload" } });
              }
            } else {
              await fbLog(db, { level: "debug", scope: "password_email", msg: "no email found in merchant/userinfo/payload", event, idemKey, merchant: merchantId, orderId });
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
    // B) Subscription → set plan
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
    // C) Order/Shipment snapshot + Custom updated_order event
    if (event.startsWith("order.") || event.startsWith("shipment.") || event === "updated_order") {
      const storeUidFromEvent = pickStoreUidFromSalla(dataRaw, body.merchant) || null;

      // Special handling for updated_order event
      if (event === "updated_order") {
        // Extract previous and current states if available
        const dataRecord = dataRaw as Record<string, unknown>;
        const previousState = (dataRecord?.previous_status as string) || (dataRecord?.old_status as string);
        const currentState = asOrder.status || asOrder.order_status || (dataRecord?.new_status as string);

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
      // Handle review.added via service (includes moderation + background job)
      const storeUid = merchantId != null ? `salla:${String(merchantId)}` : undefined;
      if (storeUid && dataRaw && typeof dataRaw === 'object') {
        try {
          // Get store subscription info for verification
          const storeSnap = await db.collection("stores").doc(storeUid).get();
          const storeData = storeSnap.data();
          const subscription = storeData?.subscription || {};
          const subscriptionStart = subscription.startedAt || 0;

          // Build payload for service
          const reviewData = dataRaw as Record<string, unknown>;
          const payload = {
            type: reviewData.type as string | undefined,
            content: reviewData.content as string | undefined,
            rating: reviewData.rating as number | undefined,
            product: reviewData.product as { id?: string | number; name?: string } | undefined,
            order: reviewData.order as { id?: string | number; order_id?: string | number; reference_id?: string; date?: { date?: string } } | undefined,
            customer: reviewData.customer as { name?: string; email?: string; mobile?: string } | undefined,
          };

          const result = await sallaService.handleReviewAdded(
            storeUid,
            String(merchantId),
            payload,
            subscriptionStart,
            {
              appUrl: process.env.NEXT_PUBLIC_APP_URL || `https://${req.headers.host}`,
              cronSecret: process.env.CRON_SECRET || '',
            }
          );

          if (result.saved) {
            await fbLog(db, {
              level: "info",
              scope: "review",
              msg: "review saved via service",
              event,
              idemKey,
              merchant: merchantId,
              orderId,
              meta: { docId: result.docId, status: result.status, flagged: result.flagged }
            });
          } else {
            await fbLog(db, {
              level: "info",
              scope: "review",
              msg: `review skipped: ${result.skipped}`,
              event,
              idemKey,
              merchant: merchantId,
              orderId
            });
          }

          return res.status(200).json({ ok: true, processed: true });
        } catch (syncErr) {
          const errMsg = syncErr instanceof Error ? syncErr.message : String(syncErr);
          await fbLog(db, { level: "error", scope: "review", msg: "review save exception", event, idemKey, merchant: merchantId, meta: { error: errMsg } });
        }
      }
    }

    // E) processed + known/unhandled logs
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

    // Development debugging (only in non-production)
    if (process.env.NODE_ENV !== "production") {
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
