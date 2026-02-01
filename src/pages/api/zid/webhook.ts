// src/pages/api/zid/webhook.ts
// Comprehensive Zid webhook handler - handles app, subscription, and order events
// Note: NO review invites per user request - reviews are synced from Zid API directly

import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import { dbAdmin } from "@/lib/firebaseAdmin";

export const config = { api: { bodyParser: false } };

type UnknownRecord = Record<string, unknown>;

interface ZidWebhookBody {
  event?: string;
  data?: UnknownRecord;
  app_id?: string | number;
  store_id?: string | number;
  timestamp?: number;
}

interface ZidSubscriptionData {
  plan_id?: string | number;
  started_at?: string | number;
  expires_at?: string | number;
  status?: string;
}

interface ZidOrder {
  id?: string | number;
  number?: string | number;
  status?: string;
  customer?: {
    id?: string | number;
    name?: string;
    email?: string;
    mobile?: string;
  };
  store?: {
    id?: string | number;
    name?: string;
    domain?: string;
  } | null;
  items?: Array<{
    product_id?: string | number;
    id?: string | number;
    name?: string;
    quantity?: number;
    price?: number;
  }>;
  total?: number;
  currency?: string;
  created_at?: string;
}

function readRawBody(req: NextApiRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function validSignature(raw: Buffer, secret: string, given?: string): boolean {
  if (!secret) return true; // No secret configured = skip validation
  if (!given) return false;
  try {
    const mac = crypto.createHmac("sha256", secret).update(raw).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(given));
  } catch {
    return false;
  }
}

function extractStoreUid(data: UnknownRecord): string | null {
  const store = data["store"] as UnknownRecord | undefined;
  const storeId = store?.["id"] ?? data["store_id"];
  return storeId !== undefined ? `zid:${storeId}` : null;
}

// App lifecycle event handlers
async function handleAppAuthorized(
  db: FirebaseFirestore.Firestore,
  storeId: string,
  data: UnknownRecord
) {
  console.log(`[ZID] App authorized for store: ${storeId}`);

  await db.collection("stores").doc(`zid:${storeId}`).set(
    {
      zid: {
        connected: true,
        authorizedAt: Date.now(),
      },
    },
    { merge: true }
  );

  // Log event
  await db.collection("webhooks_log").add({
    platform: "zid",
    event: "app.market.application.authorized",
    storeUid: `zid:${storeId}`,
    data,
    createdAt: Date.now(),
  });
}

async function handleAppInstalled(
  db: FirebaseFirestore.Firestore,
  storeId: string,
  data: UnknownRecord
) {
  console.log(`[ZID] App installed for store: ${storeId}`);

  await db.collection("stores").doc(`zid:${storeId}`).set(
    {
      zid: {
        connected: true,
        installedAt: Date.now(),
      },
    },
    { merge: true }
  );

  await db.collection("webhooks_log").add({
    platform: "zid",
    event: "app.market.application.install",
    storeUid: `zid:${storeId}`,
    data,
    createdAt: Date.now(),
  });
}

async function handleAppUninstalled(
  db: FirebaseFirestore.Firestore,
  storeId: string,
  data: UnknownRecord
) {
  console.log(`[ZID] App uninstalled for store: ${storeId}`);

  await db.collection("stores").doc(`zid:${storeId}`).set(
    {
      zid: {
        connected: false,
        uninstalledAt: Date.now(),
      },
    },
    { merge: true }
  );

  await db.collection("webhooks_log").add({
    platform: "zid",
    event: "app.market.application.uninstall",
    storeUid: `zid:${storeId}`,
    data,
    createdAt: Date.now(),
  });
}

// Subscription event handlers
async function handleSubscriptionActive(
  db: FirebaseFirestore.Firestore,
  storeId: string,
  data: ZidSubscriptionData
) {
  console.log(`[ZID] Subscription active for store: ${storeId}`);

  const startedAt = data.started_at
    ? (typeof data.started_at === 'string' ? new Date(data.started_at).getTime() : data.started_at)
    : Date.now();

  await db.collection("stores").doc(`zid:${storeId}`).set(
    {
      zid: {
        subscription: {
          status: "active",
          planId: data.plan_id ?? null,
          startedAt,
          expiresAt: data.expires_at ?? null,
          updatedAt: Date.now(),
        },
      },
    },
    { merge: true }
  );

  await db.collection("webhooks_log").add({
    platform: "zid",
    event: "app.market.subscription.active",
    storeUid: `zid:${storeId}`,
    data,
    createdAt: Date.now(),
  });
}

async function handleSubscriptionSuspended(
  db: FirebaseFirestore.Firestore,
  storeId: string,
  data: ZidSubscriptionData
) {
  console.log(`[ZID] Subscription suspended for store: ${storeId}`);

  await db.collection("stores").doc(`zid:${storeId}`).set(
    {
      zid: {
        subscription: {
          status: "suspended",
          updatedAt: Date.now(),
        },
      },
    },
    { merge: true }
  );

  await db.collection("webhooks_log").add({
    platform: "zid",
    event: "app.market.subscription.suspended",
    storeUid: `zid:${storeId}`,
    data,
    createdAt: Date.now(),
  });
}

async function handleSubscriptionExpired(
  db: FirebaseFirestore.Firestore,
  storeId: string,
  data: ZidSubscriptionData
) {
  console.log(`[ZID] Subscription expired for store: ${storeId}`);

  await db.collection("stores").doc(`zid:${storeId}`).set(
    {
      zid: {
        subscription: {
          status: "expired",
          updatedAt: Date.now(),
        },
      },
    },
    { merge: true }
  );

  await db.collection("webhooks_log").add({
    platform: "zid",
    event: "app.market.subscription.expired",
    storeUid: `zid:${storeId}`,
    data,
    createdAt: Date.now(),
  });
}

// Order event handlers (for snapshot only - no invites)
async function handleOrderCreated(
  db: FirebaseFirestore.Firestore,
  order: ZidOrder,
  storeUid: string | null
) {
  const orderId = String(order.id ?? "");
  if (!orderId) return;

  console.log(`[ZID] Order created: ${orderId}`);

  await db.collection("orders").doc(orderId).set({
    id: orderId,
    number: order.number ?? null,
    status: order.status ?? null,
    customer: {
      name: order.customer?.name ?? null,
      email: order.customer?.email ?? null,
      mobile: order.customer?.mobile ?? null,
    },
    storeUid,
    platform: "zid",
    total: order.total ?? null,
    currency: order.currency ?? null,
    items: order.items?.map(item => ({
      productId: item.product_id ?? item.id,
      name: item.name ?? null,
      quantity: item.quantity ?? 1,
      price: item.price ?? null,
    })) ?? [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }, { merge: true });
}

async function handleOrderStatusUpdate(
  db: FirebaseFirestore.Firestore,
  order: ZidOrder,
  storeUid: string | null
) {
  const orderId = String(order.id ?? "");
  if (!orderId) return;

  console.log(`[ZID] Order status update: ${orderId} -> ${order.status}`);

  await db.collection("orders").doc(orderId).set({
    status: order.status ?? null,
    storeUid,
    platform: "zid",
    updatedAt: Date.now(),
  }, { merge: true });

  // NOTE: No review invites - reviews are synced from Zid API directly
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const raw = await readRawBody(req);
  const db = dbAdmin();

  // Validate signature if secret is configured
  const secret = process.env.ZID_WEBHOOK_SECRET ?? "";
  const sig = (req.headers["x-zid-signature"] as string) ?? "";
  if (!validSignature(raw, secret, sig)) {
    console.warn("[ZID] Invalid webhook signature");
    return res.status(401).json({ error: "invalid_signature" });
  }

  let body: ZidWebhookBody;
  try {
    body = JSON.parse(raw.toString("utf8") || "{}") as ZidWebhookBody;
  } catch {
    return res.status(400).json({ error: "invalid_json" });
  }

  const event = String(body.event || "");
  const data = (body.data ?? {}) as UnknownRecord;
  const storeId = String(body.store_id ?? data["store_id"] ?? (data["store"] as UnknownRecord)?.["id"] ?? "");

  // Idempotency check
  const idemKey = crypto.createHash("sha256").update((sig || "") + "|").update(raw).digest("hex");
  const idemRef = db.collection("webhooks_zid").doc(idemKey);
  const idemSnap = await idemRef.get();
  if (idemSnap.exists) {
    return res.status(200).json({ ok: true, deduped: true });
  }
  await idemRef.set({ at: Date.now(), event, storeId });

  console.log(`[ZID] Webhook received: ${event} for store: ${storeId}`);

  try {
    // App lifecycle events
    if (event === "app.market.application.authorized") {
      await handleAppAuthorized(db, storeId, data);
    } else if (event === "app.market.application.install") {
      await handleAppInstalled(db, storeId, data);
    } else if (event === "app.market.application.uninstall") {
      await handleAppUninstalled(db, storeId, data);
    }
    // Subscription events
    else if (event === "app.market.subscription.active") {
      await handleSubscriptionActive(db, storeId, data as ZidSubscriptionData);
    } else if (event === "app.market.subscription.suspended") {
      await handleSubscriptionSuspended(db, storeId, data as ZidSubscriptionData);
    } else if (event === "app.market.subscription.expired") {
      await handleSubscriptionExpired(db, storeId, data as ZidSubscriptionData);
    }
    // Order events (snapshot only - no invites)
    else if (event === "order.create") {
      const storeUid = extractStoreUid(data);
      await handleOrderCreated(db, data as ZidOrder, storeUid);
    } else if (event === "order.status.update") {
      const storeUid = extractStoreUid(data);
      await handleOrderStatusUpdate(db, data as ZidOrder, storeUid);
    }
    // Unknown event - log for debugging
    else {
      console.log(`[ZID] Unknown event: ${event}`);
      await db.collection("webhooks_log").add({
        platform: "zid",
        event,
        storeId,
        data,
        createdAt: Date.now(),
        type: "unknown",
      });
    }

    return res.status(200).json({ ok: true, event });
  } catch (err) {
    console.error(`[ZID] Webhook error for ${event}:`, err);
    return res.status(500).json({ error: "internal_error" });
  }
}
