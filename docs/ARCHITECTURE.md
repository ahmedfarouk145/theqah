# Architecture Overview

> **Last Updated:** March 2026
> **Version:** 3.0 (Pull-Based Review Sync — Salla + Zid)

---

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Frontend (Next.js 15.5)                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐       │
│  │  Landing Page    │    │  Dashboard       │    │  Public Store    │       │
│  │  /index.tsx      │    │  /dashboard.tsx  │    │  /store/[uid]    │       │
│  └─────────┬────────┘    └────────┬─────────┘    └─────────┬────────┘       │
│            │                      │                        │                 │
└────────────┼──────────────────────┼────────────────────────┼─────────────────┘
             │                      │                        │
             ▼                      ▼                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          API Routes (60+ Endpoints)                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  /api/salla/           /api/zid/              /api/reviews/                  │
│  ├─ webhook.ts         ├─ webhook.ts          ├─ index.ts                    │
│  ├─ callback.ts        ├─ callback.ts         ├─ export-csv.ts               │
│  └─ status.ts          ├─ sync-reviews.ts     └─ export-pdf.ts               │
│                        ├─ status.ts                                          │
│  /api/cron/            └─ disconnect.ts        /api/public/                  │
│  ├─ backfill-review-ids.ts  (every 10min)      ├─ reviews.ts                 │
│  ├─ sync-zid-reviews.ts                        └─ store-profile.ts           │
│  ├─ sync-salla-reviews.ts                                                    │
│  └─ cleanup-retention.ts                        /api/admin/  (27 endpoints)  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Server Layer (19 Services)                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         Core Services                                │    │
│  │  ReviewService            │  SallaWebhookService                    │    │
│  │  SallaReviewIdLookup      │  ZidReviewSyncService                   │    │
│  │  SallaTokenService        │  ZidTokenService                        │    │
│  │  StoreService             │  AdminService                           │    │
│  │  AnalyticsService         │  MonitoringService                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         Repositories (10)                            │    │
│  │  ReviewRepository │ StoreRepository │ OrderRepository │ OwnerRepo   │    │
│  │  DomainRepository │ AuditLogRepository │ BaseRepository              │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         Infrastructure                               │    │
│  │  Messaging (12)  │  Moderation (4)  │  Monitoring (5)  │  Queue (3) │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Firebase (Firestore + Auth)                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Collections:                                                                │
│  ├─ stores          # Store profiles, settings, connection status            │
│  ├─ reviews         # Reviews pulled from Salla/Zid APIs                    │
│  ├─ orders          # Order snapshots from webhooks                          │
│  ├─ salla_tokens    # Salla OAuth tokens (auto-refresh)                      │
│  ├─ zid_tokens      # Zid OAuth tokens (auto-refresh)                        │
│  ├─ outbox_jobs     # Background job queue (SMS/email notifications)         │
│  ├─ idempotency_keys# Prevent duplicate processing                           │
│  ├─ metrics         # Monitoring & quota data                                │
│  ├─ short_links     # URL shortener for share links                          │
│  └─ feedback        # User feedback submissions                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Review Sync Architecture (Core Flow)

TheQah no longer generates invitation links or sends review request SMS/emails.
Reviews are **pulled from the native platform APIs** after buyers submit them on Salla/Zid directly.

### Salla Review Flow

```
Buyer submits review on Salla storefront
          │
          ▼
Salla fires review.added webhook
          │
          ▼
salla-webhook.service.ts → saves review to Firestore
  - status: approved/pending (based on AI moderation)
  - verified: true if order date >= subscription start
  - trustedBuyer: false (not yet enriched)
  - needsSallaId: true  ← deferred enrichment flag
          │
          ▼
Cron: backfill-review-ids (every 10 min)
  - Finds reviews where needsSallaId === true
  - Calls Salla Reviews API (https://api.salla.dev/admin/v2/reviews)
  - Matches by: orderId + stars + text
  - Updates: sallaReviewId, needsSallaId = false
```

**Key file:** `src/backend/server/services/salla-review-id-lookup.service.ts`
- Paginates through Salla API results
- Groups pending reviews by orderId for efficient matching
- Stops early when all reviews are matched
- Has page cap (`MAX_SALLA_REVIEW_LOOKUP_PAGES`) with warning log on hit

### Zid Review Flow

```
Buyer submits review on Zid storefront
          │
          ▼
Cron: sync-zid-reviews (scheduled) OR manual /api/zid/sync-reviews
  - Calls Zid API: GET /v1/managers/store/reviews/product
  - Paginates (page_size: 20, max 50 pages)
  - Filters by: status=approved, date_from=(now - sinceDays)
  - For each review: checks if zid_${reviewId} already exists in Firestore
  - Maps: ZidApiReview → internal Review format
  - Sets: trustedBuyer from product.bought_this_item
  - Sets: verified based on subscription start date
```

**Key file:** `src/backend/server/services/zid-review-sync.service.ts`

### Widget Display Flow

```
Visitor loads merchant storefront
          │
          ▼
theqah-widget.min.js (<5KB) injected in product page
          │
          ▼
GET /api/public/reviews?storeId=xxx&productId=yyy
          │
          ▼
VerificationService.getVerifiedReviews()
  - Checks store exists and is connected
  - Returns only approved + verified reviews
  - Displays trust badge + review list
```

---

## Project Structure

```
theqah/
├── src/
│   ├── pages/                    # Next.js Pages Router
│   │   ├── api/                  # 60+ API endpoints
│   │   │   ├── admin/            # 27 admin endpoints
│   │   │   ├── salla/            # Salla OAuth & webhooks
│   │   │   ├── zid/              # Zid OAuth, sync, webhooks
│   │   │   ├── reviews/          # Review CRUD (8 endpoints)
│   │   │   ├── cron/             # Scheduled jobs
│   │   │   ├── jobs/             # Async job handlers
│   │   │   └── public/           # Public widget APIs
│   │   ├── dashboard/            # Merchant dashboard
│   │   ├── store/[storeUid]/     # Public store review pages
│   │   └── *.tsx                 # Public pages (15+)
│   │
│   ├── backend/server/           # Server-side logic
│   │   ├── services/             # 19 business services
│   │   │   ├── review.service.ts
│   │   │   ├── salla-review-id-lookup.service.ts  ← NEW
│   │   │   ├── zid-review-sync.service.ts         ← NEW
│   │   │   ├── salla-webhook.service.ts
│   │   │   ├── zid-webhook.service.ts
│   │   │   ├── salla-token.service.ts
│   │   │   └── zid-token.service.ts
│   │   ├── repositories/         # 10 data repositories
│   │   ├── messaging/            # SMS, Email (12 files)
│   │   ├── moderation/           # AI content moderation (4)
│   │   ├── monitoring/           # Metrics & logging (5)
│   │   ├── queue/                # Outbox pattern job queue (3)
│   │   ├── core/                 # Shared types & errors (6)
│   │   └── auth/                 # Auth middleware (3)
│   │
│   ├── components/               # Shared UI components
│   │   ├── ui/                   # Base UI (Radix-based)
│   │   ├── dashboard/            # Dashboard components
│   │   └── admin/                # Admin components
│   │
│   └── lib/                      # Core libraries
│       ├── firebase.ts           # Client Firebase SDK
│       ├── firebaseAdmin.ts      # Admin SDK singleton
│       ├── sallaClient.ts        # Salla API client (auto token refresh)
│       └── zid/client.ts         # Zid API client
│
├── functions/                    # Firebase Cloud Functions
├── public/widgets/               # Embeddable widget scripts
│   ├── theqah-widget.js          # Full source
│   ├── theqah-widget.min.js      # Minified production (<5KB)
│   └── theqah-zid-widget.js      # Zid-specific widget
├── scripts/                      # Build & maintenance scripts
├── tools/                        # Testing & debugging tools
│   └── loadtest/k6/              # Load tests (3 scripts)
└── docs/                         # Documentation
```

---

## E-Commerce Platform Integrations

### Salla Integration

| Aspect | Detail |
|---|---|
| OAuth | `/api/salla/callback.ts` — stores tokens in `salla_tokens` collection |
| Webhook Events | `app.installed`, `order.created`, `order.updated`, `review.added` |
| Review Webhook | Saves review immediately with `needsSallaId: true` |
| Review Backfill | Cron every 10 min — matches via Salla Reviews API |
| Token Refresh | `SallaTokenService.getValidAccessToken()` — auto-refreshes before expiry |
| API Base | `https://api.salla.dev/admin/v2` |

### Zid Integration

| Aspect | Detail |
|---|---|
| OAuth | `/api/zid/callback.ts` — dual-token storage (`access_token` + `authorization`) |
| Review Sync | Cron/manual — polls `/v1/managers/store/reviews/product` |
| Trusted Buyer | Set from `product.bought_this_item` in Zid API response |
| Verified Flag | Set based on `subscriptionStart` date vs review `created_at` |
| API Base | `https://api.zid.sa/v1` |

---

## Security Model

### Authentication Layers

| Layer | Mechanism |
|---|---|
| Merchant (client) | Firebase Auth (email/password) |
| API routes (server) | Firebase Admin SDK — JWT verification |
| Salla OAuth | OAuth 2.0 with auto-refresh |
| Zid OAuth | OAuth 2.0 dual-token (access_token + authorization header) |
| Cron endpoints | `CRON_SECRET` bearer token |
| Admin endpoints | `ADMIN_SECRET` + Firebase custom claim `admin: true` |

### Firestore Security Rules

| Collection | Public Read | Write Access |
|---|---|---|
| `reviews` | approved only | Admin/Server |
| `stores` | No | Owner/Admin |
| `orders` | No | Owner/Admin |
| `salla_tokens` / `zid_tokens` | No | Admin only |
| `outbox_jobs` / `outbox_dlq` | No | Admin only |
| `idempotency_keys` | No | Admin only |
| `metrics` | No | Admin only |
| `feedback` | No | Create: public, manage: Admin |

### Rate Limiting

```
Middleware:  20 requests / 60 seconds per IP (in-memory)
KV backend:  Upstash Redis for distributed rate limiting
Public APIs: Configurable presets via RateLimitPresets
```

---

## Cron Jobs

| Route | Schedule | Purpose |
|---|---|---|
| `/api/cron/backfill-review-ids` | Every 10 min | Enrich Salla reviews with sallaReviewId |
| `/api/cron/sync-zid-reviews` | Scheduled | Pull new Zid reviews via API |
| `/api/cron/sync-salla-reviews` | Daily 3 AM UTC | Backup sync for Salla reviews |
| `/api/cron/cleanup-retention` | Scheduled | Delete expired data |
| `/api/cron/subscription-alerts` | Scheduled | Notify expiring subscriptions |

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| Pull-based review sync | Platform-native reviews carry stronger authenticity than self-submitted ones |
| `needsSallaId` deferred flag | Salla webhook fires before their API indexes the review — backfill bridges the gap |
| Repository Pattern | Consistent data access layer, easy to test and swap implementations |
| Outbox Pattern | Reliable async notifications even under network failure |
| Idempotency Keys | Prevents duplicate processing under retry/concurrent webhook delivery |
| Serverless (Vercel) | Zero fixed infrastructure cost, auto-scales with traffic |

---

## Tech Stack Summary

| Layer | Technology |
|---|---|
| Frontend | Next.js 15.5 (Pages Router) + TypeScript strict |
| Styling | Tailwind CSS 3 + Radix UI + Framer Motion |
| Database | Google Cloud Firestore (NoSQL, serverless) |
| Auth | Firebase Auth + Firebase Admin SDK |
| Hosting | Vercel (Serverless Functions + Static) |
| Cloud Functions | Firebase Cloud Functions (Node 20) |
| Cache / Rate Limit | Upstash Redis / Vercel KV |
| Email | SendGrid (primary) + Dmail SMTP (fallback) |
| SMS | OurSMS |
| AI Moderation | OpenAI API |
| Image CDN | Firebase Storage + Uploadcare |

---

## Dependencies

| Category | Key Packages |
|---|---|
| Framework | Next.js 15.5, React 19 |
| Database | Firebase 12, Firebase Admin 13 |
| UI | Radix UI, Framer Motion, Recharts, TipTap |
| Validation | Zod |
| HTTP | Axios |
| AI | OpenAI v5 |
| Notifications | SendGrid, Nodemailer |
| Testing | Vitest, Playwright, k6 |
| Build | Terser (widget minification) |
