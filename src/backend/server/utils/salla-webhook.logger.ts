/**
 * Salla Webhook Logger
 * @module server/utils/salla-webhook.logger
 */

import type { Dict, WebhookLogEntry } from "../types/salla-webhook.types";

const WEBHOOK_LOG_DEST = (process.env.WEBHOOK_LOG_DEST || "console").trim().toLowerCase();
const ENABLE_FIRESTORE_LOGS = process.env.ENABLE_FIRESTORE_LOGS === "true";

export async function fbLog(
    db: FirebaseFirestore.Firestore,
    entry: WebhookLogEntry
): Promise<void> {
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

    // Always log to console first (non-blocking)
    const lineObj = {
        event: payload.event,
        merchant: payload.merchant,
        orderId: payload.orderId,
        idemKey: payload.idemKey
    };
    const line = `[${entry.level.toUpperCase()}][${entry.scope}] ${entry.msg} :: ${JSON.stringify(lineObj)}`;

    if (entry.level === "error" || entry.level === "warn") {
        console.error(line);
    } else {
        console.log(line);
    }

    // Only attempt Firestore logging if explicitly enabled AND not critical path
    if ((WEBHOOK_LOG_DEST === "firestore" || ENABLE_FIRESTORE_LOGS) && entry.level !== "debug") {
        // Fire-and-forget with error handling
        db.collection("webhook_firebase").add(payload)
            .catch(err => {
                console.error("[WEBHOOK_LOG][WRITE_FAIL]", err);
            });
    }
}

export function createLogEntry(
    level: WebhookLogEntry["level"],
    scope: string,
    msg: string,
    context: {
        event?: string | null;
        idemKey?: string | null;
        merchant?: string | number | null;
        orderId?: string | null;
        meta?: Dict;
    } = {}
): WebhookLogEntry {
    return {
        level,
        scope,
        msg,
        ...context,
    };
}
