# TheQah Issues Tracker

> **Last Updated:** January 21, 2026  
> **Total Issues:** 47 (8 Critical, 12 High, 15 Medium, 12 Low)

---

## 🔴 Critical Issues (8) - Must Fix Before Production

### C1. In-Memory Rate Limiting Won't Scale
- **Location:** `middleware.ts:7-8`, `server/rate-limit-public.ts:63-66`
- **Problem:** Rate limiting uses `Map()` - resets on every serverless cold start
- **Comment in code:** `"// in-memory (تجريبي فقط؛ للإنتاج استخدم Redis/KV)"`
- **Fix:** Migrate to Vercel KV or Upstash Redis
- **Status:** ⏳ Open

### C2. Environment Variables Without Validation
- **Location:** Multiple API files using `process.env.VARIABLE!`
- **Problem:** Non-null assertions crash if env vars missing
- **Examples:** `SALLA_TOKEN_URL!`, `SALLA_CLIENT_ID!`, `SALLA_CLIENT_SECRET!`
- **Fix:** Add Zod validation at app startup
- **Status:** ⏳ Open

### C3. Hardcoded Token Fallback ✅ FIXED
- **Location:** `src/pages/api/salla/webhook.ts:148-183`
- **Problem:** 'dummy' fallback could leak in production
- **Fix:** Now validates SALLA_APP_TOKEN exists, logs warning if missing, skips API call
- **Status:** ✅ Done (Jan 21, 2026)

### C4. Duplicate Server Directories ✅ SYNCED
- **Locations:** `src/server/` AND `src/backend/server/`
- **Problem:** Backup folder was out of sync (missing 1 file, 2 outdated)
- **Fix:** Synced `src/backend/server/services/` with latest files
  - Added `salla-token.service.ts`
  - Updated `index.ts`
  - Updated `salla-webhook.service.ts`
- **Status:** ✅ Done (Jan 21, 2026) - directories now in sync

### C5. No Centralized Error Handling
- **Location:** All API routes
- **Problem:** Each API implements own error response format
- **Fix:** Create shared error middleware
- **Status:** ⏳ Open

### C6. Missing API Rate Limit on Write Endpoints
- **Location:** `api/reviews/submit.ts`, `api/feedback.ts`
- **Problem:** Write endpoints lack rate limiting
- **Fix:** Apply `rateLimitPublic` middleware
- **Status:** ⏳ Open

### C7. Webhook Signature Bypass in Development
- **Location:** `src/pages/api/salla/webhook.ts:30`
- **Code:** `const isDevelopment = process.env.NODE_ENV === "development"`
- **Problem:** Could accidentally skip validation if NODE_ENV misconfigured
- **Fix:** Explicit environment check
- **Status:** ⏳ Open

### C8. No Request Timeout Handling
- **Location:** External API calls (Salla, Zid, OurSMS)
- **Problem:** No timeout on axios/fetch calls - can hang indefinitely
- **Fix:** Add axios timeout config globally
- **Status:** ⏳ Open

---

## 🟠 High Priority Issues (12) - Fix Within 1 Week

| ID | Issue | Location | Status |
|----|-------|----------|--------|
| H1 | Zid integration outside src/ | `/zid/` folder | ⏸️ Deferred |
| H2 | No dev/prod metrics separation | monitoring/ | ⏳ Open |
| H3 | Missing Firestore indexes for common queries | firestore.indexes.json | ⏳ Open |
| H4 | No API versioning | all endpoints | ⏳ Open |
| H5 | Widget script not minified in dev | public/widgets/ | ⏳ Open |
| H6 | No health check for dependencies | api/health.ts | ⏳ Open |
| H7 | Console.log in production code | rate-limit-public.ts | ⏳ Open |
| H8 | Missing CORS on some public endpoints | api/public/ | ⏳ Open |
| H9 | No retry logic for SMS failures | messaging/send-sms.ts | ⏳ Open |
| H10 | Webhook idempotency key collision risk | webhook handlers | ⏳ Open |
| H11 | No pagination on admin list endpoints | api/admin/ | ⏳ Open |
| H12 | Missing audit logging for admin actions | admin endpoints | ⏳ Open |

---

## 🟡 Medium Priority (15) - Fix Within 1 Month

| ID | Issue | Location |
|----|-------|----------|
| M1 | No E2E test coverage for Zid flow | tests/ |
| M2 | Widget needs mobile optimization | public/widgets/ |
| M3 | No OpenAPI/Swagger documentation | docs/ |
| M4 | Missing loading states in dashboard | components/dashboard/ |
| M5 | No offline support for widget | widgets/ |
| M6 | Review images not optimized | storage handling |
| M7 | No batch processing for mass review imports | api/admin/ |
| M8 | Missing email templates are hardcoded | messaging/ |
| M9 | No support for RTL in widget | public/widgets/ |
| M10 | Dashboard analytics not real-time | dashboard/analytics |
| M11 | No export for orders data | api/orders/ |
| M12 | Missing search in reviews list | api/reviews/ |
| M13 | No filtering by date range | dashboard |
| M14 | Subscription expiry notifications missing | billing/ |
| M15 | No dark mode for public widget | widgets/ |

---

## 🟢 Low Priority (12) - Nice to Have

| ID | Issue | Location |
|----|-------|----------|
| L1 | Add Storybook for component docs | components/ |
| L2 | Add performance budgets CI check | CI/CD |
| L3 | Lighthouse score tracking | tools/ |
| L4 | Add i18n for more languages | locales/ |
| L5 | Review reply feature | reviews/ |
| L6 | Add review verified badge images | public/ |
| L7 | Social share buttons on reviews | widgets/ |
| L8 | Add review analytics trends | dashboard/ |
| L9 | Email preview in dashboard | admin/ |
| L10 | SMS cost estimation | billing/ |
| L11 | Bulk review moderation UI | admin/ |
| L12 | Add review sentiment analysis | moderation/ |

---

## ✅ Completed Issues

| ID | Issue | Completed | Notes |
|----|-------|-----------|-------|
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
