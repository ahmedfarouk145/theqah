// src/pages/api/zid/webhook.ts
// Thin controller — delegates all business logic to ZidWebhookService
// No review invites — reviews are synced from Zid API via cron

import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import { dbAdmin } from "@/lib/firebaseAdmin";
import { ZidWebhookService } from "@/backend/server/services/zid-webhook.service";
import type { ZidOrder } from "@/backend/server/services/zid-webhook.service";
import { ZidStoreRepository } from "@/server/repositories/zid-store.repository";

const zidStoreRepo = new ZidStoreRepository();

export const config = { api: { bodyParser: false } };

// ── helpers ──────────────────────────────────────────────────

function readRawBody(req: NextApiRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function validSignature(raw: Buffer, secret: string, given?: string): boolean {
  if (!secret) return true;
  if (!given) return false;
  try {
    const mac = crypto.createHmac("sha256", secret).update(raw).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(given));
  } catch {
    return false;
  }
}

// ── handler ──────────────────────────────────────────────────

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log(`[ZID_WEBHOOK] ▶ Incoming ${req.method} from ${req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown"}`);
  console.log(`[ZID_WEBHOOK] Headers:`, JSON.stringify({
    "content-type": req.headers["content-type"],
    "x-zid-signature": req.headers["x-zid-signature"] ? "present" : "missing",
    "user-agent": req.headers["user-agent"],
    "x-forwarded-for": req.headers["x-forwarded-for"],
  }));

  if (req.method !== "POST") {
    console.warn(`[ZID_WEBHOOK] ❌ Rejected: method=${req.method}`);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const raw = await readRawBody(req);
  console.log(`[ZID_WEBHOOK] Raw body length: ${raw.length} bytes`);

  const db = dbAdmin();

  // Validate signature
  const secret = process.env.ZID_WEBHOOK_SECRET ?? "";
  const sig = (req.headers["x-zid-signature"] as string) ?? "";
  console.log(`[ZID_WEBHOOK] Signature check: secret=${secret ? "configured" : "EMPTY"}, sig=${sig ? "present" : "missing"}`);
  if (!validSignature(raw, secret, sig)) {
    console.warn("[ZID_WEBHOOK] ❌ Invalid webhook signature");
    return res.status(401).json({ error: "invalid_signature" });
  }

  // Parse body
  type UnknownRecord = Record<string, unknown>;
  let body: { event?: string; event_name?: string; data?: UnknownRecord; store_id?: string | number };
  try {
    body = JSON.parse(raw.toString("utf8") || "{}");
  } catch {
    console.error(`[ZID_WEBHOOK] ❌ Invalid JSON body: ${raw.toString("utf8").substring(0, 200)}`);
    return res.status(400).json({ error: "invalid_json" });
  }

  console.log(`[ZID_WEBHOOK] Parsed body:`, JSON.stringify({
    event: body.event,
    event_name: (body as Record<string, unknown>).event_name,
    store_id: body.store_id,
    dataKeys: body.data ? Object.keys(body.data) : [],
    bodyKeys: Object.keys(body),
  }));

  // Zid has 3 webhook payload formats:
  // 1. App webhooks (partner dashboard): flat payload with "event_name" field
  // 2. Merchant webhooks (order.*): flat order object with NO event field — detect by presence of "order_status"/"invoice_number"
  // 3. Generic webhooks: "event" field with nested "data"
  const flatBody = body as Record<string, unknown>;
  let event = String(body.event || flatBody.event_name || "");
  if (!event && flatBody.order_status !== undefined) {
    // Order webhook — no event field, detect by payload shape
    // Distinguish: payment_status_change → payment update, otherwise → order create
    if (flatBody.payment_status_change !== undefined) {
      event = "order.payment_status.update";
    } else {
      event = "order.create";
    }
  }
  const data = (body.data ?? body ?? {}) as UnknownRecord;
  const storeId = String(
    body.store_id ?? data["store_id"] ?? (data["store"] as UnknownRecord)?.["id"] ?? ""
  );
  const storeUid = storeId ? `zid:${storeId}` : "";

  console.log(`[ZID_WEBHOOK] Resolved: event="${event}", storeId="${storeId}", storeUid="${storeUid}"`);

  // Idempotency check
  const idemKey = crypto.createHash("sha256").update((sig || "") + "|").update(raw).digest("hex");
  const idemRef = db.collection("webhooks_zid").doc(idemKey);
  if ((await idemRef.get()).exists) {
    console.log(`[ZID_WEBHOOK] ⏭ Deduped: ${event} for store ${storeId}`);
    return res.status(200).json({ ok: true, deduped: true });
  }
  await idemRef.set({ at: Date.now(), event, storeId });

  console.log(`[ZID_WEBHOOK] ✅ Processing: ${event} for store: ${storeId}`);

  const svc = new ZidWebhookService();

  try {
    switch (event) {
      // App lifecycle
      case "app.market.application.authorized": {
        // Full auto-registration is in callback.ts (OAuth flow)
        // Webhook just marks store as connected
        await svc.handleAppInstalled(storeUid);
        break;
      }
      case "app.market.application.install":
        await svc.handleAppInstalled(storeUid);
        break;

      case "app.market.application.uninstall":
        await svc.handleAppUninstalled(storeUid);
        break;

      // Subscription
      case "app.market.subscription.active":
      case "app.market.subscription.upgrade":
      case "app.market.subscription.renew":
        await svc.handleSubscriptionActive(storeUid, data as object);
        // Capture merchant_email if available (ZID sends it in flat payload).
        // merchantEmail is a top-level Zid-only convention not enumerated on
        // the Store type — cast through Parameters<>.
        if (storeUid && (data as Record<string, unknown>).merchant_email) {
          await zidStoreRepo.set(
            storeUid,
            {
              merchantEmail: String((data as Record<string, unknown>).merchant_email),
            } as unknown as Parameters<typeof zidStoreRepo.set>[1],
          );
        }
        break;

      case "app.market.subscription.suspended":
      case "app.market.subscription.expired":
        await svc.handleSubscriptionExpired(storeUid, data as object);
        break;

      // Orders — saved with product IDs for review polling
      case "order.create":
        await svc.handleOrderCreated(data as ZidOrder, storeUid);
        break;

      case "order.status.update": {
        const orderId = String((data as ZidOrder).id ?? "");
        const newStatus = String((data as ZidOrder).status ?? (data as ZidOrder).order_status ?? "");
        await svc.handleOrderStatusUpdate(orderId, newStatus);
        break;
      }

      case "order.payment_status.update": {
        const orderId2 = String((data as ZidOrder).id ?? "");
        const paymentStatus = String((data as Record<string, unknown>)["payment_status"] ?? "");
        await svc.handleOrderStatusUpdate(orderId2, paymentStatus);
        break;
      }

      default:
        console.log(`[ZID] Unknown event: ${event}`);
    }

    // Always log the event
    await svc.logEvent(event, storeUid, "webhook", { storeId, raw: data });

    console.log(`[ZID_WEBHOOK] ✅ Completed: ${event} for store ${storeId}`);
    return res.status(200).json({ ok: true, event });
  } catch (err) {
    console.error(`[ZID_WEBHOOK] ❌ Handler error for ${event}:`, err);
    return res.status(500).json({ error: "internal_error" });
  }
}
