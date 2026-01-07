/**
 * Shared configuration constants
 * @module shared/config
 */

// API endpoints
export const API_ENDPOINTS = {
    // Reviews
    REVIEWS_LIST: '/api/reviews/list',
    REVIEWS_SUBMIT: '/api/reviews/submit',
    REVIEWS_CHECK_VERIFIED: '/api/reviews/check-verified',

    // Store
    STORE_INFO: '/api/store/info',
    STORE_SETTINGS: '/api/store/settings',
    STORE_DASHBOARD: '/api/store/dashboard',

    // Auth
    AUTH_SESSION: '/api/auth/session',

    // Public
    PUBLIC_WIDGET: '/api/public/widget',
    PUBLIC_REVIEWS: '/api/public/reviews',
    PUBLIC_STATS: '/api/public/stats',
} as const;

// Review statuses
export const REVIEW_STATUSES = {
    PENDING: 'pending',
    PENDING_REVIEW: 'pending_review',
    APPROVED: 'approved',
    REJECTED: 'rejected',
    HIDDEN: 'hidden',
} as const;

// Subscription plans
export const PLANS = {
    FREE: 'free',
    BASIC: 'basic',
    PRO: 'pro',
    ENTERPRISE: 'enterprise',
} as const;

// Limits
export const LIMITS = {
    MAX_REVIEW_TEXT_LENGTH: 2000,
    MAX_REVIEW_IMAGES: 5,
    MAX_IMAGE_SIZE_MB: 5,
    REVIEWS_PER_PAGE: 20,
    ORDERS_PER_PAGE: 50,
} as const;

// Feature flags (can be overridden by env vars)
export const FEATURES = {
    AI_MODERATION: process.env.NEXT_PUBLIC_FEATURE_AI_MODERATION === 'true',
    SMS_NOTIFICATIONS: process.env.NEXT_PUBLIC_FEATURE_SMS === 'true',
    ADVANCED_ANALYTICS: process.env.NEXT_PUBLIC_FEATURE_ANALYTICS === 'true',
} as const;

// External URLs
export const EXTERNAL_URLS = {
    SALLA_OAUTH: 'https://accounts.salla.sa/oauth2/auth',
    SALLA_API: 'https://api.salla.dev',
    ZID_API: 'https://api.zid.sa',
} as const;
