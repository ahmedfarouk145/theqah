# TheQah Issues Tracker

> **Last Updated:** January 21, 2026  
> **Total Issues:** 47 (8 Critical, 12 High, 15 Medium, 12 Low)

---

## 🔴 Critical Issues (8) - Must Fix Before Production

### C1. In-Memory Rate Limiting Won't Scale ✅ FIXED
- **Location:** `middleware.ts:7-8`, `backend/server/rate-limit-public.ts:63-66`
- **Problem:** Rate limiting uses `Map()` - resets on every serverless cold start
- **Comment in code:** `"// in-memory (تجريبي فقط؛ للإنتاج استخدم Redis/KV)"`
- **Fix:** Created `rate-limit-kv.ts` with Vercel KV support, falls back to memory
- **Status:** ✅ Done (Jan 22, 2026)

### C2. Environment Variables Without Validation ✅ FIXED
- **Location:** `src/lib/env.ts`
- **Problem:** Non-null assertions crash if env vars missing
- **Fix:** Updated Zod validation with optional fields and safeParse for graceful handling
- **Status:** ✅ Done (Jan 22, 2026)

### C3. Hardcoded Token Fallback ✅ FIXED
- **Location:** `src/pages/api/salla/webhook.ts:148-183`
- **Problem:** 'dummy' fallback could leak in production
- **Fix:** Now validates SALLA_APP_TOKEN exists, logs warning if missing, skips API call
- **Status:** ✅ Done (Jan 21, 2026)

### C4. Duplicate Server Directories ✅ MIGRATED
- **Previous:** `src/server/` AND `src/backend/server/` (duplicated)
- **Problem:** Separation of frontend/backend was started but not completed
- **Fix:** 
  - Updated `tsconfig.json`: `@/server/*` now points to `src/backend/server/*`
  - Synced missing files to `src/backend/server/`
  - Deleted old `src/server/` folder
- **Status:** ✅ Done (Jan 21, 2026) - Full migration complete

### C5. No Centralized Error Handling
- **Location:** All API routes
- **Problem:** Each API implements own error response format
- **Fix:** Create shared error middleware
- **Status:** ✅ Done (Jan 21, 2026)

### C6. Missing API Rate Limit on Write Endpoints
- **Location:** `api/reviews/submit.ts`, `api/feedback.ts`
- **Problem:** Write endpoints lack rate limiting
- **Fix:** Apply `rateLimitPublic` middleware
- **Status:** ✅ Done (Jan 21, 2026)

### C7. Webhook Signature Bypass in Development
- **Location:** `src/pages/api/salla/webhook.ts:30`
- **Code:** `const isDevelopment = process.env.NODE_ENV === "development"`
- **Problem:** Could accidentally skip validation if NODE_ENV misconfigured
- **Fix:** Explicit environment check
- **Status:** ✅ Done (Jan 21, 2026)

### C8. No Request Timeout Handling
- **Location:** External API calls (Salla, Zid, OurSMS)
- **Problem:** No timeout on axios/fetch calls - can hang indefinitely
- **Fix:** Add axios timeout config globally
- **Status:** ✅ Done (Jan 21, 2026)

---

## 🟠 High Priority Issues (12) - Fix Within 1 Week

| ID | Issue | Location | Status |
|----|-------|----------|--------|
| H1 | Zid integration outside src/ | `/zid/` folder | ⏸️ Deferred |
| H2 | No dev/prod metrics separation | monitoring/ | ✅ Done (already in code) |
| H3 | Missing Firestore indexes | firestore.indexes.json | ✅ Done (25+ indexes exist) |
| H4 | No API versioning | all endpoints | ⏸️ Deferred (not critical yet) |
| H5 | Widget script not minified in dev | public/widgets/ | ✅ Done (Jan 21, 2026) |
| H6 | No health check for dependencies | api/health.ts | ✅ Done (Jan 21, 2026) |
| H7 | Console.log in production code | rate-limit-public.ts | ✅ Done (Jan 21, 2026) |
| H8 | Missing CORS on some public endpoints | api/public/ | ✅ Done (Jan 21, 2026) |
| H9 | No retry logic for SMS failures | messaging/send-sms.ts | ✅ Done (Jan 21, 2026) |
| H10 | Webhook idempotency key collision risk | webhook handlers | ✅ Done (Jan 21, 2026) |
| H11 | No pagination on admin list endpoints | api/admin/ | ✅ Done (Jan 21, 2026) |
| H12 | Missing audit logging for admin actions | admin endpoints | ✅ Done (Jan 21, 2026) |

---

## 🟡 Medium Priority (3 remaining) - Fix Within 1 Month

| ID | Issue | Location | Status |
|----|-------|----------|--------|
| M3 | OpenAPI/Swagger documentation | docs/ | ✅ Done (Created API.md) |
| M4 | Loading states in dashboard | components/dashboard/ | ✅ Done (Skeleton.tsx) |
| M6 | Review images optimization | storage handling | ✅ Done (OptimizedImage.tsx) |
| M1 | E2E test coverage for Zid flow | tests/ | ⏸️ Deferred |
| M7 | Batch processing for mass imports | api/admin/ | ⏸️ Deferred |
| M10 | Dashboard analytics real-time | dashboard/analytics | ⏸️ Deferred |
| M2 | Widget mobile optimization | public/widgets/ | ✅ Done (already exists) |
| M9 | RTL support in widget | public/widgets/ | ✅ Done (already exists) |
| M11 | Orders export | api/orders/ | ✅ Done (API created) |
| M12 | Search in reviews list | api/reviews/ | ✅ Done (API updated) |
| M13 | Date range filtering | dashboard | ✅ Done (API updated) |
| M14 | Subscription expiry notifications | billing/ | ✅ Done (cron created) |

## 🟢 Low Priority - All Done! ✅

| ID | Issue | Status |
|----|-------|--------|
| L8 | Review analytics trends | ✅ Done (API created) |
| L10 | SMS cost estimation | ✅ Done (API created) |
| L11 | Bulk review moderation | ✅ Backend exists (needs UI) |

## ✅ Completed Issues

| ID | Issue | Completed | Notes |
|----|-------|-----------|-------|
| C3 | Hardcoded Token Fallback | Jan 21, 2026 | Removed 'dummy' fallback in webhook.ts |
| C4 | Backend/Server Migration | Jan 21, 2026 | Migrated to src/backend/server/, deleted src/server/ |
| H2 | Dev/Prod Metrics Separation | Jan 21, 2026 | Already implemented in metrics.ts |
| H3 | Firestore Indexes | Jan 21, 2026 | 25+ indexes already exist |
| L8 | Review Analytics Trends | Jan 21, 2026 | Created api/analytics/trends.ts |
| L10 | SMS Cost Estimation | Jan 21, 2026 | Created api/usage/sms.ts |
| M2 | Widget Mobile Optimization | Jan 21, 2026 | Already exists with @media queries |
| M9 | RTL Support in Widget | Jan 21, 2026 | Already exists with direction: rtl |
| M3 | API Documentation | Jan 21, 2026 | Created docs/API.md |
| M4 | Loading Skeletons | Jan 21, 2026 | Created components/ui/Skeleton.tsx |
| M6 | Image Optimization | Jan 21, 2026 | Created lib/image-optimizer.ts |
| M11 | Orders Export | Jan 21, 2026 | Created api/orders/export.ts |
| M12 | Search in Reviews | Jan 21, 2026 | Updated api/reviews/list.ts |
| M13 | Date Range Filtering | Jan 21, 2026 | Updated api/reviews/list.ts |
| M14 | Subscription Expiry Alerts | Jan 21, 2026 | Created api/cron/subscription-alerts.ts |
| - | Update ARCHITECTURE.md | Jan 21, 2026 | Fully rewritten |
| - | Create ISSUES_TRACKER.md | Jan 21, 2026 | This file |

---

## How to Use This Tracker

1. **Pick an issue** from Critical or High priority
2. **Update status** to `🔄 In Progress`
3. **Create PR** with fix
4. **Update status** to `✅ Done` with date

**Status Legend:**
- ⏳ Open
- 🔄 In Progress
- ⏸️ Deferred
- ✅ Done
