# CODEX.md — Full Project Guide for AI Assistants

> **Read this file first.** It gives you everything you need to understand, navigate, and safely modify TheQah.

---

## 1. What Is TheQah?

**TheQah** (الثقة) is a **verified customer reviews & loyalty platform** for **Salla** and **Zid** e-commerce stores in Saudi Arabia. It:

1. Connects to a merchant's Salla/Zid store via OAuth.
2. Listens for order events via webhooks.
3. Automatically sends review invitations (SMS/Email) to verified buyers.
4. Collects reviews, moderates them (AI + manual), and publishes them.
5. Displays reviews on the store's product pages via an embeddable JavaScript widget.
6. Provides a merchant dashboard (analytics, reviews, orders, settings) and a platform-owner admin panel.

**Business model:** Freemium SaaS — TRIAL (10 reviews/mo free), PAID_MONTHLY (21 SAR/mo, unlimited), PAID_ANNUAL (210 SAR/yr, unlimited).

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Framework | **Next.js 15.5** (Pages Router, NOT App Router) |
| Language | **TypeScript** (strict) |
| Database | **Firebase Firestore** (NoSQL documents) |
| Auth | **Firebase Auth** (email/password) + **Salla/Zid OAuth** |
| Storage | **Firebase Storage** (blog images) |
| Hosting | **Vercel** (serverless functions + static) |
| CSS | **Tailwind CSS 3** + **Radix UI** primitives |
| Animation | **Framer Motion** |
| Charts | **Recharts** |
| Rich Editor | **TipTap** (blog posts) |
| SMS | **OurSMS** API |
| Email | **SendGrid** + **Nodemailer** (fallback) |
| AI | **OpenAI** (review moderation) |
| Rate Limiting | In-memory (middleware) + **Upstash Redis / Vercel KV** (API routes) |
| Testing | **Vitest** (unit), **Playwright** (E2E), **k6** (load) |
| Cron | **Vercel Cron** + **GitHub Actions** (backup) |

---

## 3. Project Structure

```
theqah/
├── src/
│   ├── pages/                    # Next.js Pages Router
│   │   ├── _app.tsx              # App wrapper (AuthProvider, ThemeProvider, Toaster)
│   │   ├── _document.tsx         # Custom HTML document (Arabic RTL, fonts)
│   │   ├── index.tsx             # Landing page (public)
│   │   ├── login.tsx             # Merchant login
│   │   ├── signup.tsx            # Merchant signup
│   │   ├── easy-register.tsx     # Simplified registration flow
│   │   ├── setup-password.tsx    # First-time password setup after Salla install
│   │   ├── forgot-password.tsx   # Password recovery
│   │   ├── reset-password.tsx    # Password reset
│   │   ├── dashboard.tsx         # Merchant dashboard (main)
│   │   ├── dashboard/            # Dashboard sub-pages
│   │   ├── admin/                # Platform admin pages
│   │   ├── blog/                 # Blog pages (list, read, manage)
│   │   ├── connect/              # Salla/Zid connection pages
│   │   ├── review/               # Public review submission page
│   │   ├── r/                    # Short link redirect (/r/[code])
│   │   ├── embedded/             # iFrame-embeddable pages
│   │   ├── salla/                # Salla app iframe pages
│   │   ├── faq.tsx, terms.tsx, privacy-policy.tsx, support.tsx, report.tsx
│   │   └── api/                  # ⬇️ All API routes (see §4)
│   │
│   ├── backend/                  # Server-side business logic (layered architecture)
│   │   ├── server/
│   │   │   ├── services/         # 19 service classes (core business logic)
│   │   │   ├── repositories/     # 10 Firestore data-access repositories
│   │   │   ├── messaging/        # 12 SMS/Email template & sending modules
│   │   │   ├── monitoring/       # Metrics collection & API monitoring
│   │   │   ├── middleware/       # Server-side middleware (auth, CORS)
│   │   │   ├── moderation/       # AI-powered review moderation
│   │   │   ├── queue/            # Outbox pattern job queue (SMS/email sending)
│   │   │   ├── auth/             # Auth helpers (Firebase Admin, token verification)
│   │   │   ├── core/             # Core utilities (config, errors, logging)
│   │   │   ├── utils/            # Shared server utilities
│   │   │   ├── zid/              # Zid-specific server logic
│   │   │   ├── rate-limit.ts     # Rate limiting (Redis/KV-backed)
│   │   │   ├── rate-limit-kv.ts  # Vercel KV rate limiter
│   │   │   ├── rate-limit-public.ts  # Public endpoint rate limiter
│   │   │   ├── short-links.ts    # Short link generation & resolution
│   │   │   ├── review-tokens.ts  # Secure review submission tokens
│   │   │   ├── verification-utils.ts  # Purchase verification logic
│   │   │   ├── activity-tracker.ts    # User activity tracking
│   │   │   └── withCors.ts       # CORS wrapper for API handlers
│   │   ├── config/               # Server config
│   │   └── lib/                  # Server-only libraries
│   │
│   ├── components/               # React components
│   │   ├── dashboard/            # Merchant dashboard components
│   │   │   ├── Analytics.tsx     # Charts & analytics views
│   │   │   ├── Reviews.tsx       # Review management UI
│   │   │   ├── OrdersTab.tsx     # Order history view
│   │   │   ├── StoreSettings.tsx # Store configuration
│   │   │   ├── Support.tsx       # Support ticket form
│   │   │   └── LazyCharts.tsx    # Lazy-loaded chart components
│   │   ├── admin/                # Admin panel components
│   │   │   ├── AdminStores.tsx        # Store management
│   │   │   ├── AdminReviews.tsx       # Review moderation
│   │   │   ├── AdminSubscriptions.tsx # Subscription management
│   │   │   ├── AdminAnalytics.tsx     # Platform analytics
│   │   │   ├── AdminMonitoring.tsx    # System health monitoring
│   │   │   ├── AdminReports.tsx       # Reporting
│   │   │   ├── QuotaDashboard.tsx     # Firestore quota tracking
│   │   │   ├── FailedWebhooksDashboard.tsx  # Webhook failure tracking
│   │   │   └── UserActivityDashboard.tsx    # User activity logs
│   │   ├── ui/                   # Shared UI primitives (Button, Dialog, Select, etc.)
│   │   ├── blog/                 # Blog components
│   │   ├── AnimatedLogo.tsx, LoadingSpinner.tsx, NavbarLanding.tsx, etc.
│   │   └── FeedbackWidget.tsx    # Floating feedback widget
│   │
│   ├── contexts/                 # React contexts
│   │   ├── AuthContext.tsx       # Auth state (user, store, loading)
│   │   └── ThemeContext.tsx      # Light/dark theme
│   │
│   ├── lib/                      # Shared libraries (client + server)
│   │   ├── firebase.ts           # Firebase client SDK init
│   │   ├── firebaseAdmin.ts      # Firebase Admin SDK init
│   │   ├── salla.ts              # Salla client helper
│   │   ├── sallaClient.ts        # Salla API client (token refresh, API calls)
│   │   ├── salla-admin.ts        # Salla admin operations
│   │   ├── salla/                # Salla integration modules
│   │   ├── oursms.ts             # OurSMS API client
│   │   ├── zid/                  # Zid integration modules (auth, client, tokens, webhooks)
│   │   ├── env.ts                # Environment variable validation
│   │   ├── logger.ts             # Structured logging
│   │   ├── axiosInstance.ts      # Pre-configured Axios instance
│   │   └── image-optimizer.ts    # Image optimization utilities
│   │
│   ├── config/                   # Configuration
│   │   ├── constants.ts          # All magic numbers, timeouts, limits, feature flags
│   │   └── plans.ts              # Subscription plan definitions (TRIAL, PAID_MONTHLY, PAID_ANNUAL)
│   │
│   ├── frontend/                 # Frontend-specific code (mirrors backend structure)
│   │   ├── components/           # Frontend-only components
│   │   ├── contexts/             # Frontend-only contexts
│   │   ├── features/             # Feature modules
│   │   ├── hooks/                # Custom React hooks
│   │   └── locales/              # i18n translations
│   │
│   ├── types/                    # TypeScript type definitions
│   ├── types.ts                  # Core types (OutboxJob, PlanConfig, ReviewDoc, etc.)
│   ├── styles/                   # Global CSS
│   ├── shared/                   # Code shared between frontend & backend
│   ├── utils/                    # Shared utilities
│   └── worker/                   # Web worker scripts
│
├── public/
│   ├── widgets/                  # Embeddable widget files
│   │   ├── theqah-widget.js      # Full widget source
│   │   ├── theqah-widget.min.js  # Minified version (served to stores)
│   │   └── loading-skeleton.js   # Widget loading skeleton
│   └── logo.png, favicon.ico, etc.
│
├── functions/                    # Firebase Cloud Functions (cleanup/maintenance)
├── scripts/                      # Build & maintenance scripts
│   ├── minify-widgets.js         # Widget minification (runs on build)
│   ├── test-salla-api.js         # Salla API testing
│   ├── fix-review-order-ids.js   # Data migration: fix order IDs
│   ├── export-reviews.mjs        # Export reviews to CSV
│   └── ...                       # Various fix/debug scripts
│
├── tools/                        # Development & testing tools
│   ├── salla-webhook-tester.js   # Simulate Salla webhooks
│   ├── webhook-tester-v2.js      # Updated webhook simulator
│   ├── test-review-sending.js    # Test review invite flow
│   ├── test-easy-mode.js         # Test easy registration
│   ├── loadtest/                 # k6 load testing scripts
│   └── ...
│
├── zid/                          # Zid platform integration module
│   ├── api/                      # Zid API routes
│   ├── lib/                      # Zid helper libraries
│   ├── server/                   # Zid server-side logic
│   ├── pages/                    # Zid-specific pages
│   └── components/               # Zid-specific components
│
├── docs/                         # Documentation (20+ files)
│   ├── ARCHITECTURE.md           # System architecture deep-dive
│   ├── QUICK_START.md            # Setup guide
│   ├── API.md                    # API documentation
│   ├── SALLA_REVIEWS_INTEGRATION.md  # Salla integration guide
│   ├── ISSUES_TRACKER.md         # Known issues (47 items)
│   ├── WEBHOOK_RETRY.md          # Webhook retry system docs
│   ├── RATE_LIMITING.md          # Rate limiter documentation
│   ├── openapi.yaml              # OpenAPI 3 spec
│   └── ...
│
├── tests/                        # Test files
├── middleware.ts                  # Next.js middleware (rate limiting + CORS)
├── firestore.rules               # Firestore security rules
├── firestore.indexes.json        # Firestore composite indexes
├── storage.rules                 # Firebase Storage security rules
├── firebase.json                 # Firebase project config
├── vercel.json                   # Vercel cron jobs config
├── next.config.ts                # Next.js configuration
├── tailwind.config.ts            # Tailwind CSS configuration
└── package.json                  # Dependencies & scripts
```

---

## 4. API Routes Map

All API routes live under `src/pages/api/`. Key groups:

### 4.1 Salla Integration (`/api/salla/`)

| Route | Purpose |
|---|---|
| `webhook.ts` | **Main Salla webhook handler** — receives `app.installed`, `order.updated`, `app.store.authorize` events. 42KB, most critical file. |
| `status.ts` | Check Salla connection status for a store |
| `verify.ts` | Verify Salla webhook signatures |

### 4.2 Zid Integration (`/api/zid/`)

| Route | Purpose |
|---|---|
| `webhook.ts` | Zid webhook handler |
| `callback.ts` | OAuth callback |
| `start.ts` | OAuth initiation |
| `status.ts` | Connection status |
| `refresh.ts` | Token refresh |
| `disconnect.ts` | Disconnect store |
| `sync-reviews.ts` | Sync reviews from Zid |

### 4.3 Reviews (`/api/reviews/`)

| Route | Purpose |
|---|---|
| `submit.ts` | Public review submission |
| `list.ts` | List reviews for a store |
| `moderate.ts` | AI moderation |
| `update-status.ts` | Approve/reject reviews |
| `check-verified.ts` | Verify purchase for review |
| `export-csv.ts` | Export reviews as CSV |
| `export-pdf.ts` | Export reviews as PDF |
| `[id]/` | Individual review operations |

### 4.4 Public APIs (`/api/public/`)

| Route | Purpose |
|---|---|
| `reviews.ts` | Public review listing (for widget) |
| `widget.ts` | Widget configuration endpoint |
| `stats.ts` | Public store stats |
| `blog.ts` | Public blog posts |
| `pixel.ts` | Analytics pixel |
| `reviews/resolve.ts` | Review domain resolution |

### 4.5 Admin (`/api/admin/`)

28 endpoints covering: stores, reviews, subscriptions, monitoring, cleanup, quota tracking, webhooks, analytics, user activity, reports, support tickets.

### 4.6 Cron Jobs (`/api/cron/`)

| Route | Schedule | Purpose |
|---|---|---|
| `webhook-retry.ts` | Every 5 min | Retry failed webhooks |
| `backfill-review-ids.ts` | Every 10 min | Backfill missing review IDs |
| `subscription-alerts.ts` | Daily 9 AM | Subscription expiry alerts |
| `sync-zid-reviews.ts` | Manual/cron | Sync Zid reviews |

### 4.7 Other

| Group | Purpose |
|---|---|
| `/api/auth/` | Login, signup, password reset |
| `/api/store/` | Store dashboard data, settings, connection status |
| `/api/orders/` | Order management |
| `/api/sms/` | SMS sending, balance check |
| `/api/blog/` | Blog CRUD |
| `/api/analytics/` | Store analytics |
| `/api/ai/` | AI moderation |
| `/api/jobs/` | Background job management |

---

## 5. Firestore Data Model

### Collections

| Collection | Document ID | Purpose |
|---|---|---|
| `stores` | `{sallaStoreId}` or `{uid}` | Store profile, Salla/Zid tokens, settings, subscription info |
| `orders` | `{auto-id}` | Order records (from Salla/Zid webhooks) |
| `reviews` | `{auto-id}` | Customer reviews with status, rating, text, author |
| `review_invites` | `{auto-id}` | Review invitation records (SMS/email sent) |
| `review_tokens` | `{auto-id}` | Secure tokens for review submission links |
| `short_links` | `{code}` | Short URL mappings for review links |
| `review_reports` | `{auto-id}` | Reported/flagged reviews |
| `salla_tokens` | `{uid}` | Salla OAuth tokens (access + refresh) |
| `zid_tokens` | `{uid}` | Zid OAuth tokens |
| `zid_states` | `{id}` | Zid OAuth state parameters |
| `zid_events` | `{id}` | Zid webhook event logs |
| `roles` | `{uid}` | User roles (admin flag) |
| `feedback` | `{auto-id}` | User feedback submissions |
| `outbox_jobs` | `{jobId}` | Outbox pattern: queued SMS/email jobs |
| `outbox_dlq` | `{jobId}` | Dead letter queue for failed jobs |
| `admin_audit_logs` | `{auto-id}` | Admin action audit trail |
| `admin_alerts` | `{auto-id}` | System alerts |
| `metrics` | `{auto-id}` | Application metrics for monitoring |
| `syncLogs` | `{auto-id}` | Salla review sync logs |
| `idempotency_keys` | `{id}` | Idempotency keys to prevent duplicate processing |

### Key Document Shapes

**Store document** (`stores/{id}`):

```ts
{
  storeName: string;
  email: string;
  provider: "salla" | "zid";
  salla: {
    connected: boolean;
    storeId: number;
    storeName: string;
    accessToken: string;   // encrypted
    refreshToken: string;  // encrypted
    expiresAt: Timestamp;
  };
  subscription: {
    plan: "TRIAL" | "PAID_MONTHLY" | "PAID_ANNUAL";
    active: boolean;
    startsAt: Timestamp;
    expiresAt: Timestamp;
  };
  settings: {
    autoApprove: boolean;
    sendSms: boolean;
    sendEmail: boolean;
    widgetEnabled: boolean;
    // ...
  };
  meta: { userinfo: { ... } };   // Salla user info
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Review document** (`reviews/{id}`):

```ts
{
  storeUid: string;
  orderId: string;
  productId?: string;
  status: "pending" | "approved" | "rejected" | "published";
  rating: number;         // 1-5
  text: string;
  author: {
    show: boolean;
    name: string | null;
    displayName: string;
  };
  verified: boolean;      // purchase verified
  sallaReviewId?: string; // synced to Salla
  publishedAt?: Timestamp;
  createdAt: Timestamp;
}
```

---

## 6. Key Flows

### 6.1 Store Registration (Salla)

```
Merchant installs app on Salla
  → Salla sends `app.installed` webhook to /api/salla/webhook
  → webhook handler creates store doc in Firestore
  → sends welcome email to merchant
  → merchant visits /setup-password to create account
  → AuthContext finds store by email, links to Firebase Auth user
```

### 6.2 Review Collection

```
Customer places order on Salla store
  → Salla sends `order.updated` (status=delivered) webhook
  → webhook handler creates order doc
  → creates outbox_job to send review invitation
  → cron/worker processes outbox → sends SMS/email with short link
  → customer clicks link → /review/[token] page
  → customer submits review → /api/reviews/submit
  → review saved as "pending" → AI moderation → auto/manual approve
  → approved review visible in widget
```

### 6.3 Widget Display

```
Store installs widget script tag on their Salla theme
  → Browser loads /widgets/theqah-widget.min.js
  → Widget JS calls /api/public/widget?domain={storeDomain}
  → API resolves domain → finds store → returns config
  → Widget calls /api/public/reviews?store={storeUid}
  → Widget renders star ratings + review cards on product page
```

### 6.4 Dashboard Authentication

```
Merchant visits /login → Firebase Auth (email/password)
  → AuthContext.tsx: onAuthStateChanged fires
  → Looks up stores/{uid} for alias → resolves real storeUid
  → Falls back to email-based store lookup
  → Sets store context (storeUid, storeName, platform)
  → Dashboard components use useAuth() hook
```

---

## 7. Authentication & Authorization

### Roles

| Role | How Identified | Access |
|---|---|---|
| **Public** | No auth | Widget API, review submission, public pages |
| **Merchant** | Firebase Auth (email/pass) | Dashboard, own store data |
| **Admin** | Firebase Auth + `admin: true` custom claim | Admin panel, all stores, all data |
| **Cron/Server** | `CRON_SECRET` or `ADMIN_SECRET` Bearer token | Cron jobs, admin API endpoints |

### API Auth Patterns

- **Public endpoints** (`/api/public/*`): No auth, rate-limited
- **Merchant endpoints** (`/api/reviews/*`, `/api/store/*`): Firebase ID token in `Authorization: Bearer {idToken}`
- **Admin endpoints** (`/api/admin/*`): `Authorization: Bearer {ADMIN_SECRET}`
- **Webhook endpoints** (`/api/salla/webhook`, `/api/zid/webhook`): Signature verification
- **Cron endpoints** (`/api/cron/*`): `Authorization: Bearer {CRON_SECRET}`

---

## 8. Backend Architecture

The backend follows a **layered architecture**:

```
API Route (pages/api/*)
  → Middleware (auth, rate-limit, CORS)
    → Service (backend/server/services/*)
      → Repository (backend/server/repositories/*)
        → Firestore (via firebase-admin)
```

### Services (19 total)

| Service | Responsibility |
|---|---|
| `review.service.ts` | Review CRUD, moderation, syncing |
| `store.service.ts` | Store management, settings |
| `order.service.ts` | Order processing |
| `salla-webhook.service.ts` | Salla webhook event handling |
| `salla-token.service.ts` | Salla OAuth token management |
| `registration.service.ts` | Store registration flow |
| `sms.service.ts` | SMS sending logic |
| `auth.service.ts` | Auth operations |
| `admin.service.ts` | Admin panel operations |
| `domain-resolver.service.ts` | Domain → store mapping for widget |
| `verification.service.ts` | Purchase verification |
| `notification.service.ts` | Notification orchestration |
| `analytics.service.ts` | Analytics aggregation |
| `activity.service.ts` | User activity logging |
| `monitoring.service.ts` | System health metrics |
| `maintenance.service.ts` | Cleanup & maintenance tasks |
| `export.service.ts` | CSV/PDF export |
| `support.service.ts` | Support ticket management |

### Repositories (10 total)

Each wraps Firestore operations for one collection:
`base`, `store`, `review`, `order`, `domain`, `review-token`, `owner`, `audit-log`, `factory`, `index`.

### Messaging (12 modules)

Handles all outbound communication:

- `send-sms.ts` — OurSMS integration
- `send-invite.ts` — Review invitation sending
- `email-sendgrid.ts` — SendGrid email
- `email-dmail.ts` — Alternative email provider
- `merchant-welcome.ts` — Welcome email template
- `send-rejection.ts` — Review rejection notification
- `unified-templates.ts` — Unified message templates
- `phone.ts` — Phone number formatting
- `sms-length.ts` — SMS character counting
- `invite-text.ts`, `texts.ts`, `templates.ts` — Message content

---

## 9. Widget System

The widget is a **standalone vanilla JavaScript** file (`public/widgets/theqah-widget.js`) that:

- Self-initializes on Salla product pages
- Detects the store domain and product ID from the page URL
- Calls TheQah public API to fetch reviews
- Injects star ratings and review cards into the product page DOM
- Displays a "Verified Buyer" badge
- Supports Arabic RTL layout
- Has a loading skeleton for better UX
- Is minified via `scripts/minify-widgets.js` at build time

Build command: `npm run build:widgets` (runs before `next build`).

---

## 10. Environment Variables

Required variables (defined in `.env.local`):

```
# Firebase Client
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID

# Firebase Admin
FIREBASE_ADMIN_PROJECT_ID
FIREBASE_ADMIN_PRIVATE_KEY
FIREBASE_ADMIN_CLIENT_EMAIL

# Salla
NEXT_PUBLIC_SALLA_CLIENT_ID
SALLA_CLIENT_SECRET
NEXT_PUBLIC_SALLA_REDIRECT_URI
SALLA_WEBHOOK_SECRET

# Zid
ZID_CLIENT_ID
ZID_CLIENT_SECRET
ZID_REDIRECT_URI

# Security
CRON_SECRET          # Bearer token for cron endpoints
ADMIN_SECRET         # Bearer token for admin endpoints

# SMS (OurSMS)
OURSMS_APP_KEY
OURSMS_USERNAME
OURSMS_SENDER_ID

# Email (SendGrid)
SENDGRID_API_KEY
SENDGRID_FROM_EMAIL

# AI (OpenAI)
OPENAI_API_KEY

# App URLs
NEXT_PUBLIC_APP_URL=https://theqah.vercel.app
NEXT_PUBLIC_WIDGET_URL=https://theqah.vercel.app/widgets

# Rate Limiting (Upstash / Vercel KV)
KV_REST_API_URL
KV_REST_API_TOKEN
```

---

## 11. Important Conventions & Rules

### Code Style

- **Language:** TypeScript everywhere (strict mode)
- **Imports:** Use `@/` path alias → maps to `src/`
- **API Routes:** Next.js Pages Router style (`export default function handler(req, res)`)
- **Naming:** camelCase for functions/variables, PascalCase for components/types, UPPER_SNAKE for constants
- **Arabic Comments:** Some code comments are in Arabic — this is intentional and should be preserved
- **Linting:** ESLint 9 with `eslint-config-next`

### Architecture Rules

- **Never import `firebase-admin` in client code** — use `src/lib/firebaseAdmin.ts` only in `pages/api/` or `backend/server/`
- **Never import `firebase` (client SDK) in server code** — use `src/lib/firebase.ts` only in components/pages
- **All Firestore writes from API routes must use Admin SDK** — client-side Firestore rules are restrictive
- **Rate-limit all public endpoints** — use the rate-limit utilities in `backend/server/`
- **Validate inputs with Zod** where applicable

### Security Rules

- Public endpoints must not leak `storeUid` or internal IDs
- Review tokens must be single-use and time-limited
- Webhook signatures must be verified before processing
- Admin endpoints must check `ADMIN_SECRET`
- PII (phone numbers, emails) must not appear in logs

### File Organization

- **Business logic** → `src/backend/server/services/`
- **Data access** → `src/backend/server/repositories/`
- **API route handlers** → `src/pages/api/` (thin — delegates to services)
- **React components** → `src/components/`
- **Types** → `src/types/` and `src/types.ts`
- **Config** → `src/config/`

---

## 12. Scripts & Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start dev server (localhost:3000) |
| `npm run build` | Build for production (minifies widgets, then builds Next.js) |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm test` | Run Vitest unit tests |
| `npm run test:e2e` | Run Playwright E2E tests |
| `npm run test:webhook` | Simulate Salla webhook locally |
| `npm run test:review` | Test review sending flow |
| `npm run test:easy-mode` | Test easy registration flow |
| `npm run load:k6` | Run k6 load tests |

---

## 13. Deployment

- **Vercel:** Auto-deploys on `git push` to `main`. Domain: `theqah.vercel.app`
- **Firebase:** Firestore rules, indexes, and Cloud Functions deployed manually via `firebase deploy`
- **Vercel Cron:** Configured in `vercel.json` — webhook retry (5min), backfill (10min), alerts (daily)
- **GitHub Actions:** Backup cron for review sync + health checks

---

## 14. Firestore Security Rules Summary

- `stores/{uid}`: Owner or admin read/write
- `reviews/{id}`: Public read only if `status == "approved"`; server-only create/update/delete
- `orders/{id}`: Owner (by `storeUid`) or admin
- `review_tokens`, `short_links`, `salla_tokens`, `zid_tokens`: Admin/server only
- `feedback`, `review_reports`: Anyone can create; admin reads/manages
- `metrics`, `syncLogs`, `outbox_*`: Admin/server only

---

## 15. Subscription Plans

| Plan | Price | Reviews/Month | Billing |
|---|---|---|---|
| **TRIAL** | Free | 10 | — |
| **PAID_MONTHLY** | 21 SAR/mo | Unlimited | Monthly |
| **PAID_ANNUAL** | 210 SAR/yr | Unlimited | Annual |

Defined in `src/config/plans.ts`. Plan mapping from Salla names handled by `mapSallaPlanToInternal()`.

---

## 16. Known Issues & Docs

- **47 tracked issues** in `docs/ISSUES_TRACKER.md` (8 critical, 12 high)
- Full architecture docs in `docs/ARCHITECTURE.md`
- OpenAPI spec in `docs/openapi.yaml`
- Rate limiting details in `docs/RATE_LIMITING.md`
- Webhook retry system in `docs/WEBHOOK_RETRY.md`
- Monitoring setup in `docs/MONITORING_SETUP.md`

---

## 17. Quick Reference — Where to Find Things

| Looking for... | Go to... |
|---|---|
| Salla webhook handling | `src/pages/api/salla/webhook.ts` → `src/backend/server/services/salla-webhook.service.ts` |
| Review submission | `src/pages/api/reviews/submit.ts` → `src/backend/server/services/review.service.ts` |
| Widget code | `public/widgets/theqah-widget.js` |
| Widget public API | `src/pages/api/public/widget.ts` |
| Store settings | `src/components/dashboard/StoreSettings.tsx` |
| Auth flow | `src/contexts/AuthContext.tsx` |
| Subscription plans | `src/config/plans.ts` |
| All constants/limits | `src/config/constants.ts` |
| SMS sending | `src/backend/server/messaging/send-sms.ts` |
| Email sending | `src/backend/server/messaging/email-sendgrid.ts` |
| Rate limiting | `src/backend/server/rate-limit-kv.ts` |
| Firestore rules | `firestore.rules` |
| Domain → store mapping | `src/backend/server/services/domain-resolver.service.ts` |
| Admin panel | `src/pages/admin/` + `src/components/admin/` |
| Cron jobs | `src/pages/api/cron/` + `vercel.json` |
| Zid integration | `src/lib/zid/` + `src/pages/api/zid/` + `zid/` |
| Blog system | `src/pages/blog/` + `src/pages/api/blog/` + `src/components/blog/` |
| Types/interfaces | `src/types.ts` + `src/types/` + `src/backend/server/types/` |
