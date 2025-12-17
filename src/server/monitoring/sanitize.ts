/**
 * Sanitization utilities to protect PII in logs and metrics
 * GDPR-compliant data redaction
 */

/**
 * Redact email addresses (show first 2 chars + ***@domain.com)
 * Example: "user@example.com"  "us***@example.com"
 */
export function sanitizeEmail(email: string | null | undefined): string {
  if (!email || typeof email !== "string") return "***";
  
  const match = email.match(/^(.{0,2})(.*)@(.+)$/);
  if (!match) return "***@***.***";
  
  const [, prefix, , domain] = match;
  return `${prefix}***@${domain}`;
}

/**
 * Redact phone numbers (show last 4 digits: ***1234)
 * Example: "+966501234567"  "***4567"
 */
export function sanitizePhone(phone: string | number | null | undefined): string {
  if (!phone) return "***";
  
  const phoneStr = String(phone).replace(/\D/g, ""); // Remove non-digits
  if (phoneStr.length < 4) return "***";
  
  const last4 = phoneStr.slice(-4);
  return `***${last4}`;
}

/**
 * Redact passwords completely
 */
export function sanitizePassword(_password: string | null | undefined): string {
  return "***";
}

/**
 * Sanitize URLs - remove sensitive query parameters
 */
export function sanitizeUrl(url: string | null | undefined): string {
  if (!url || typeof url !== "string") return url || "";
  
  try {
    const urlObj = new URL(url);
    const sensitiveParams = ["token", "access_token", "refresh_token", "api_key", "secret", "password", "auth"];
    
    sensitiveParams.forEach(param => {
      if (urlObj.searchParams.has(param)) {
        urlObj.searchParams.set(param, "***");
      }
    });
    
    return urlObj.toString();
  } catch {
    return url;
  }
}

/**
 * Sanitize error messages - remove stack traces with file paths
 */
export function sanitizeError(error: string | Error | null | undefined): string {
  if (!error) return "";
  
  const errorStr = error instanceof Error ? error.message : String(error);
  
  let sanitized = errorStr.replace(/[A-Za-z]:\\[\w\\\-\.\s]+/g, "[PATH]");
  sanitized = sanitized.replace(/\/[\w\/\-\.\s]+/g, "[PATH]");
  sanitized = sanitized.split("\n")[0];
  
  return sanitized;
}

/**
 * Sanitize stack traces
 */
export function sanitizeStackTrace(stack: string | null | undefined): string {
  if (!stack || typeof stack !== "string") return "";
  
  return stack
    .split("\n")
    .map(line => line.replace(/\(.*[/\\](.+?):(\d+):(\d+)\)/, "([$1:$2:$3])"))
    .slice(0, 5)
    .join("\n");
}

/**
 * Sanitize entire metadata object
 */
export function sanitizeMetadata(metadata: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!metadata || typeof metadata !== "object") return {};
  
  const sanitized: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(metadata)) {
    const lowerKey = key.toLowerCase();
    
    if (lowerKey.includes("email")) {
      sanitized[key] = sanitizeEmail(String(value));
    } else if (lowerKey.includes("phone") || lowerKey.includes("mobile") || lowerKey.includes("tel")) {
      sanitized[key] = sanitizePhone(value as string);
    } else if (lowerKey.includes("password") || lowerKey.includes("secret") || lowerKey.includes("token")) {
      sanitized[key] = "***";
    } else if (lowerKey.includes("url") || lowerKey.includes("uri")) {
      sanitized[key] = sanitizeUrl(String(value));
    } else if (lowerKey.includes("error")) {
      sanitized[key] = sanitizeError(value as string);
    } else if (lowerKey.includes("stack")) {
      sanitized[key] = sanitizeStackTrace(value as string);
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = sanitizeMetadata(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

/**
 * Main sanitization function for metric events
 */
export function sanitizeMetricEvent(event: {
  error?: string;
  userId?: string;
  storeUid?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}): typeof event {
  return {
    ...event,
    error: event.error ? sanitizeError(event.error) : undefined,
    errorStack: event.errorStack ? sanitizeError(event.errorStack) : undefined, // H4: Sanitize stack traces
    errorType: event.errorType, // H4: Keep error type (no PII)
    metadata: event.metadata ? sanitizeMetadata(event.metadata) : undefined,
  };
}
