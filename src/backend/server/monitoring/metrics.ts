// src/server/monitoring/metrics.ts
import { dbAdmin } from "@/lib/firebaseAdmin";
import { sanitizeMetricEvent } from "./sanitize";
import { sendCriticalAlert } from "./alerts";

export type MetricType = 
  | "api_call"
  | "api_error" 
  | "database"
  | "database_read"
  | "database_write"
  | "auth_event"
  | "webhook_received"
  | "http_request"
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
  errorStack?: string; // H4: Full stack trace for errors
  errorType?: string; // H4: Error constructor name
  metadata?: Record<string, unknown>;
  timestamp: number;
}

/**
 * H4: Extract comprehensive error information
 */
function extractErrorDetails(error: unknown): { message: string; stack?: string; type?: string } {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
      type: error.constructor.name
    };
  }
  
  if (typeof error === "string") {
    return { message: error };
  }
  
  return { message: String(error) };
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
      type: event.type,
      severity: event.severity,
      timestamp: Date.now(),
      ...sanitized
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
        endpoint: sanitized.endpoint as string | undefined,
        method: sanitized.method as string | undefined,
        statusCode: sanitized.statusCode as number | undefined,
        error: sanitized.error as string | undefined,
        userId: sanitized.userId as string | undefined,
        storeUid: sanitized.storeUid as string | undefined,
        severity: sanitized.severity as string | undefined,
        metadata: sanitized.metadata as Record<string, unknown> | undefined
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

  /**
   * H4: Track error with full context and stack trace
   */
  async trackError(error: unknown, context: {
    endpoint?: string;
    method?: string;
    userId?: string;
    storeUid?: string;
    severity?: SeverityLevel;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const errorDetails = extractErrorDetails(error);
    
    await this.track({
      type: "api_error",
      severity: context.severity || "error",
      endpoint: context.endpoint,
      method: context.method,
      userId: context.userId,
      storeUid: context.storeUid,
      error: errorDetails.message,
      errorStack: errorDetails.stack,
      errorType: errorDetails.type,
      metadata: {
        ...context.metadata,
        errorDetails
      }
    });
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
 * H4: Helper to track errors with enhanced context
 * @deprecated Use trackErrorWithContext for better error tracking
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
 * H4: Track error with full stack trace and context
 */
export async function trackErrorWithContext(error: unknown, context: {
  endpoint?: string;
  method?: string;
  userId?: string;
  storeUid?: string;
  severity?: SeverityLevel;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await metrics.trackError(error, context);
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

/**
 * H7: Helper to track SMS sending
 */
export async function trackSMS(params: {
  to: string;
  success: boolean;
  error?: string;
  duration?: number;
  storeUid?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await metrics.track({
    type: "sms_sent",
    severity: params.success ? "info" : "warning",
    metadata: {
      to: params.to, // Will be sanitized by sanitize.ts
      duration: params.duration,
      ...params.metadata
    },
    storeUid: params.storeUid,
    userId: params.userId,
    error: params.error
  });
}

/**
 * H8: Helper to track email sending
 */
export async function trackEmail(params: {
  to: string;
  subject: string;
  success: boolean;
  error?: string;
  duration?: number;
  storeUid?: string;
  userId?: string;
  messageId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await metrics.track({
    type: "email_sent",
    severity: params.success ? "info" : "warning",
    metadata: {
      to: params.to, // Will be sanitized by sanitize.ts
      subject: params.subject,
      messageId: params.messageId,
      duration: params.duration,
      ...params.metadata
    },
    storeUid: params.storeUid,
    userId: params.userId,
    error: params.error
  });
}
