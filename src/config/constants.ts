// src/config/constants.ts

/**
 * Application Constants
 * 
 * Centralized configuration for magic numbers, timeouts, limits, and other
 * hardcoded values throughout the application.
 */

// ============= Time Constants =============

export const TIME = {
  // Milliseconds
  ONE_SECOND: 1000,
  ONE_MINUTE: 60 * 1000,
  FIVE_MINUTES: 5 * 60 * 1000,
  FIFTEEN_MINUTES: 15 * 60 * 1000,
  ONE_HOUR: 60 * 60 * 1000,
  SIX_HOURS: 6 * 60 * 60 * 1000,
  ONE_DAY: 24 * 60 * 60 * 1000,
  ONE_WEEK: 7 * 24 * 60 * 60 * 1000,
  THIRTY_DAYS: 30 * 24 * 60 * 60 * 1000,
  NINETY_DAYS: 90 * 24 * 60 * 60 * 1000,

  // Seconds
  THIRTY_SECONDS: 30,
  TWO_MINUTES: 120,
  TEN_MINUTES: 600,
} as const;

// ============= Timeout Constants =============

export const TIMEOUT = {
  // API request timeouts
  API_REQUEST: 30000, // 30 seconds
  API_REQUEST_SHORT: 10000, // 10 seconds
  API_REQUEST_LONG: 60000, // 60 seconds

  // Database operation timeouts
  DATABASE_QUERY: 10000, // 10 seconds
  DATABASE_TRANSACTION: 30000, // 30 seconds

  // External service timeouts
  WEBHOOK_REQUEST: 15000, // 15 seconds
  SMS_REQUEST: 10000, // 10 seconds
  EMAIL_REQUEST: 10000, // 10 seconds

  // Widget loading timeout
  WIDGET_LOAD: 5000, // 5 seconds
} as const;

// ============= Pagination & Limits =============

export const LIMITS = {
  // Pagination
  DEFAULT_PAGE_SIZE: 10,
  MAX_PAGE_SIZE: 100,
  MIN_PAGE_SIZE: 1,

  // Review limits
  REVIEWS_PER_PAGE: 10,
  MAX_REVIEWS_FETCH: 100,
  REVIEWS_WIDGET_DISPLAY: 5,

  // API rate limits
  RATE_LIMIT_WINDOW: 15 * 60 * 1000, // 15 minutes
  RATE_LIMIT_MAX_REQUESTS_PUBLIC: 100,
  RATE_LIMIT_MAX_REQUESTS_AUTH: 300,
  RATE_LIMIT_MAX_REQUESTS_WRITE: 20,

  // Batch processing
  BATCH_SIZE: 50,
  MAX_BATCH_SIZE: 500,

  // Retry limits
  MAX_RETRY_ATTEMPTS: 5,
  MAX_WEBHOOK_RETRIES: 5,

  // Storage limits
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5 MB
  MAX_IMAGE_SIZE: 2 * 1024 * 1024, // 2 MB

  // Text limits
  MAX_REVIEW_LENGTH: 5000,
  MAX_REVIEW_TITLE_LENGTH: 200,
  MAX_COMMENT_LENGTH: 1000,
  MAX_FEEDBACK_LENGTH: 2000,

  // Query limits
  FIRESTORE_QUERY_LIMIT: 100,
  METRICS_QUERY_LIMIT: 1000,
} as const;

// ============= Buffer Sizes =============

export const BUFFER_SIZE = {
  SMALL: 10,
  MEDIUM: 50,
  LARGE: 100,
  EXTRA_LARGE: 500,
} as const;

// ============= Cache TTL (Time To Live) =============

export const CACHE_TTL = {
  SHORT: 60, // 1 minute
  MEDIUM: 300, // 5 minutes
  LONG: 3600, // 1 hour
  VERY_LONG: 86400, // 24 hours
  PERMANENT: 31536000, // 1 year
} as const;

// ============= Firestore Quota Limits (Free Tier) =============

export const FIRESTORE_QUOTA = {
  READS_PER_DAY: 50000,
  WRITES_PER_DAY: 20000,
  DELETES_PER_DAY: 20000,

  // Alert thresholds (percentage)
  WARNING_THRESHOLD: 80,
  CRITICAL_THRESHOLD: 90,
  DANGER_THRESHOLD: 95,
} as const;

// ============= Webhook Retry Backoff Schedule =============

export const WEBHOOK_RETRY = {
  BACKOFF_SCHEDULE: [
    1 * 60 * 1000, // 1 minute
    5 * 60 * 1000, // 5 minutes
    15 * 60 * 1000, // 15 minutes
    60 * 60 * 1000, // 1 hour
    6 * 60 * 60 * 1000, // 6 hours
  ],
  MAX_ATTEMPTS: 5,
  PRIORITY: {
    HIGH: "high",
    NORMAL: "normal",
    LOW: "low",
  },
} as const;

// ============= Monitoring & Metrics =============

export const MONITORING = {
  // Retention periods
  METRICS_RETENTION_DAYS: 30,
  LOGS_RETENTION_DAYS: 90,
  ACTIVITY_RETENTION_DAYS: 90,
  QUOTA_RETENTION_DAYS: 90,
  DLQ_RETENTION_DAYS: 90,

  // Aggregation intervals
  METRICS_AGGREGATION_INTERVAL: 5 * 60 * 1000, // 5 minutes
  REALTIME_UPDATE_INTERVAL: 30 * 1000, // 30 seconds

  // Alert rate limiting
  ALERT_RATE_LIMIT_WINDOW: 60 * 60 * 1000, // 1 hour
  ALERT_MAX_PER_WINDOW: 10,
} as const;

// ============= Email & SMS =============

export const NOTIFICATION = {
  // Email sending limits
  EMAIL_RATE_LIMIT: 10, // per minute
  EMAIL_BATCH_SIZE: 50,

  // SMS sending limits
  SMS_RATE_LIMIT: 5, // per minute
  SMS_BATCH_SIZE: 20,

  // Retry attempts
  EMAIL_MAX_RETRIES: 3,
  SMS_MAX_RETRIES: 3,
} as const;

// ============= Sync & Cron Jobs =============

export const SYNC = {
  // Sync intervals
  REVIEWS_SYNC_INTERVAL: 6 * 60 * 60 * 1000, // 6 hours
  METRICS_CLEANUP_INTERVAL: 24 * 60 * 60 * 1000, // 24 hours
  BACKUP_INTERVAL: 24 * 60 * 60 * 1000, // 24 hours

  // Sync batch sizes
  REVIEWS_PER_SYNC: 100,
  STORES_PER_BATCH: 10,

  // Sync timeouts
  SYNC_TIMEOUT: 5 * 60 * 1000, // 5 minutes
} as const;

// ============= Authentication =============

export const AUTH = {
  // Session duration
  SESSION_DURATION: 7 * 24 * 60 * 60 * 1000, // 7 days
  ADMIN_SESSION_DURATION: 12 * 60 * 60 * 1000, // 12 hours

  // Token expiration
  ACCESS_TOKEN_EXPIRY: 60 * 60, // 1 hour (in seconds)
  REFRESH_TOKEN_EXPIRY: 30 * 24 * 60 * 60, // 30 days (in seconds)

  // Password requirements
  MIN_PASSWORD_LENGTH: 8,
  MAX_PASSWORD_LENGTH: 128,
} as const;

// ============= HTTP Status Codes =============

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
} as const;

// ============= Feature Flags =============

export const FEATURES = {
  ENABLE_QUOTA_TRACKING: process.env.ENABLE_QUOTA_TRACKING !== "false",
  ENABLE_WEBHOOK_RETRY: process.env.ENABLE_WEBHOOK_RETRY !== "false",
  ENABLE_DLQ: process.env.ENABLE_DLQ !== "false",
  ENABLE_METRICS: process.env.NODE_ENV === "production",
  ENABLE_RATE_LIMITING: process.env.ENABLE_RATE_LIMITING !== "false",
  ENABLE_ACTIVITY_TRACKING: process.env.ENABLE_ACTIVITY_TRACKING !== "false",
} as const;

// ============= Environment =============

export const ENV = {
  isDevelopment: process.env.NODE_ENV === "development",
  isProduction: process.env.NODE_ENV === "production",
  isTest: process.env.NODE_ENV === "test",
} as const;

// ============= Error Messages =============

export const ERROR_MESSAGES = {
  UNAUTHORIZED: "Unauthorized - Authentication required",
  FORBIDDEN: "Forbidden - Insufficient permissions",
  NOT_FOUND: "Resource not found",
  VALIDATION_ERROR: "Validation error",
  RATE_LIMIT_EXCEEDED: "Rate limit exceeded - Please try again later",
  INTERNAL_ERROR: "Internal server error",
  DATABASE_ERROR: "Database operation failed",
  EXTERNAL_SERVICE_ERROR: "External service error",
} as const;

// Export all as default for convenient access
export default {
  TIME,
  TIMEOUT,
  LIMITS,
  BUFFER_SIZE,
  CACHE_TTL,
  FIRESTORE_QUOTA,
  WEBHOOK_RETRY,
  MONITORING,
  NOTIFICATION,
  SYNC,
  AUTH,
  HTTP_STATUS,
  FEATURES,
  ENV,
  ERROR_MESSAGES,
};
