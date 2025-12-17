// src/server/monitoring/metrics.ts
import { dbAdmin } from "@/lib/firebaseAdmin";
import { sanitizeMetricEvent } from "./sanitize";
import { sendCriticalAlert } from "./alerts";

export type MetricType = 
  | "api_call"
  | "api_error" 
  | "database_read"
  | "database_write"
  | "auth_event"
  | "webhook_received"
  | "email_sent"
  | "sms_sent"
  | "review_created"
  | "sync_completed"
  | "payment_event";

export type SeverityLevel = "info" | "warning" | "error" | "critical";

export interface MetricEvent {
  type: MetricType;
  severity: SeverityLevel;
  endpoint?: string;
  method?: string;
  statusCode?: number;
  duration?: number;
  userId?: string;
  storeUid?: string;
  error?: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

class MetricsCollector {
  private buffer: MetricEvent[] = [];
  private bufferSize = 50;
  private flushInterval = 30000; // 30 seconds
  private lastFlush = Date.now();

  /**
   * Track an event - buffers and batches writes to Firestore
   */
  async track(event: Omit<MetricEvent, "timestamp">): Promise<void> {
    // H2: Only track metrics in production
    if (process.env.NODE_ENV !== "production") {
      return;
    }

    // C3: Sanitize the event before processing (GDPR compliance)
    const sanitized = sanitizeMetricEvent(event);
    
    const metricEvent: MetricEvent = {
      ...sanitized,
      timestamp: Date.now()
    };

    this.buffer.push(metricEvent);

    // Console log critical events immediately
    if (event.severity === "critical" || event.severity === "error") {
      console.error(`[METRIC ${event.type}]`, {
        severity: sanitized.severity,
        endpoint: sanitized.endpoint,
        error: sanitized.error,
        metadata: sanitized.metadata
      });
      
      // C7: Send critical alerts (non-blocking)
      sendCriticalAlert({
        endpoint: sanitized.endpoint,
        method: sanitized.method,
        statusCode: sanitized.statusCode,
        error: sanitized.error,
        userId: sanitized.userId,
        storeUid: sanitized.storeUid,
        severity: sanitized.severity,
        metadata: sanitized.metadata
      }).catch(err => {
        console.error("[METRIC] Failed to send alert:", err);
      });
    }

    // Flush if buffer is full or interval passed
    if (this.buffer.length >= this.bufferSize || 
        Date.now() - this.lastFlush >= this.flushInterval) {
      await this.flush();
    }
  }

  /**
   * Flush buffered metrics to Firestore
   */
  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const eventsToFlush = [...this.buffer];
    this.buffer = [];
    this.lastFlush = Date.now();

    try {
      const db = dbAdmin();
      const batch = db.batch();

      eventsToFlush.forEach(event => {
        const docRef = db.collection("metrics").doc();
        batch.set(docRef, event);
      });

      await batch.commit();
    } catch (error) {
      console.error("[Metrics Flush Error]:", error);
      // Re-add failed events to buffer
      this.buffer.push(...eventsToFlush);
    }
  }

  /**
   * Force flush all pending metrics
   */
  async forceFlush(): Promise<void> {
    await this.flush();
  }
}

// Singleton instance
export const metrics = new MetricsCollector();

/**
 * Helper to track API calls
 */
export async function trackApiCall(params: {
  endpoint: string;
  method: string;
  statusCode: number;
  duration: number;
  userId?: string;
  storeUid?: string;
  error?: string;
}): Promise<void> {
  await metrics.track({
    type: "api_call",
    severity: params.statusCode >= 500 ? "error" : 
              params.statusCode >= 400 ? "warning" : "info",
    ...params
  });
}

/**
 * Helper to track errors
 */
export async function trackError(params: {
  endpoint: string;
  error: string;
  userId?: string;
  storeUid?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await metrics.track({
    type: "api_error",
    severity: "error",
    ...params
  });
}

/**
 * Helper to track database operations
 */
export async function trackDatabase(params: {
  operation: "read" | "write";
  collection: string;
  count: number;
  duration?: number;
  storeUid?: string;
}): Promise<void> {
  await metrics.track({
    type: params.operation === "read" ? "database_read" : "database_write",
    severity: "info",
    metadata: {
      collection: params.collection,
      count: params.count,
      duration: params.duration
    },
    storeUid: params.storeUid
  });
}

/**
 * Helper to track webhooks
 */
export async function trackWebhook(params: {
  event: string;
  storeUid?: string;
  success: boolean;
  error?: string;
  duration?: number;
}): Promise<void> {
  await metrics.track({
    type: "webhook_received",
    severity: params.success ? "info" : "warning",
    metadata: {
      event: params.event,
      duration: params.duration
    },
    storeUid: params.storeUid,
    error: params.error
  });
}
