# Architecture Overview

> **Last Updated:** January 21, 2026  
> **Version:** 2.0 (Salla + Zid Integration)

---

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Frontend (Next.js 15.5.4)                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐       │
│  │  Landing Page    │    │  Dashboard       │    │  Review Submit   │       │
│  │  /index.tsx      │    │  /dashboard.tsx  │    │  /review/[token] │       │
│  └─────────┬────────┘    └────────┬─────────┘    └─────────┬────────┘       │
│            │                      │                        │                 │
└────────────┼──────────────────────┼────────────────────────┼─────────────────┘
             │                      │                        │
             ▼                      ▼                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          API Routes (86+ Endpoints)                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  /api/salla/          /api/reviews/         /api/admin/        /api/public/ │
│  ├─ webhook.ts        ├─ submit.ts          ├─ 27 endpoints    ├─ reviews   │
│  ├─ status.ts         ├─ list.ts            ├─ monitoring      ├─ widget    │
│  └─ verify.ts         ├─ update-status.ts   └─ management      └─ embed     │
│                       ├─ export-csv.ts                                       │
│  /zid/api/            └─ export-pdf.ts       /api/cron/                      │
│  ├─ webhook.ts                               ├─ webhook-retry.ts             │
│  ├─ callback.ts                              └─ backfill-review-ids.ts       │
│  ├─ start.ts                                                                 │
│  └─ refresh.ts                                                               │
│                                                                              │
└────────────────────────────────────────────────────────────────────────────-─┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Server Layer (19 Services)                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         Core Services                                │    │
│  │  ReviewService (743 LOC)    │  SallaWebhookService (408 LOC)        │    │
│  │  StoreService (14KB)        │  AdminService (21KB)                  │    │
│  │  OrderService (8KB)         │  AuthService (7KB)                    │    │
│  │  SMSService (7.5KB)         │  RegistrationService (9KB)            │    │
│  │  SupportService (11KB)      │  DomainResolverService (9KB)          │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         Repositories (10)                            │    │
│  │  ReviewRepository │ StoreRepository │ OrderRepository │ TokenRepo   │    │
│  │  DomainRepository │ OwnerRepository │ AuditLogRepository │ BaseRepo │    │
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
│  ├─ stores          # Store profiles & settings                             │
│  ├─ reviews         # Customer reviews (status-based access)                │
│  ├─ orders          # Order snapshots from Salla/Zid                        │
│  ├─ review_tokens   # Secure review submission tokens                       │
│  ├─ review_invites  # SMS/Email invitation tracking                         │
│  ├─ salla_tokens    # Salla OAuth tokens                                    │
│  ├─ zid_tokens      # Zid OAuth tokens                                      │
│  ├─ short_links     # URL shortener for review links                        │
│  ├─ outbox_jobs     # Background job queue                                  │
│  ├─ metrics         # Monitoring data                                       │
│  └─ feedback        # User feedback                                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
theqah/
├── src/
│   ├── pages/                    # Next.js Pages Router
│   │   ├── api/                  # 86+ API endpoints
│   │   │   ├── admin/            # 27 admin endpoints
│   │   │   ├── salla/            # Salla OAuth & webhooks
│   │   │   ├── reviews/          # Review CRUD (8 endpoints)
│   │   │   ├── orders/           # Order management
│   │   │   ├── cron/             # Scheduled jobs
│   │   │   ├── public/           # Public widget APIs
│   │   │   └── webhooks/         # Webhook handlers
│   │   ├── dashboard/            # Merchant dashboard
│   │   └── *.tsx                 # Public pages (15+)
│   │
│   ├── server/                   # Server-side logic
│   │   ├── services/             # 19 business services
│   │   ├── repositories/         # 10 data repositories
│   │   ├── messaging/            # SMS, Email (12 files)
│   │   ├── moderation/           # AI content moderation (4)
│   │   ├── monitoring/           # Metrics & logging (5)
│   │   ├── queue/                # Background jobs (3)
│   │   ├── core/                 # Shared types & errors (6)
│   │   └── auth/                 # Authentication (3)
│   │
│   ├── frontend/                 # Client-side code
│   │   ├── components/           # 34 UI components
│   │   ├── contexts/             # React contexts (2)
│   │   ├── hooks/                # Custom hooks (1)
│   │   └── features/             # Feature flags (2)
│   │
│   ├── lib/                      # Core libraries
│   │   ├── firebase.ts           # Client Firebase SDK
│   │   ├── firebaseAdmin.ts      # Admin SDK
│   │   ├── sallaClient.ts        # Salla API client
│   │   ├── oursms.ts             # SMS provider
│   │   └── logger.ts             # Logging utility
│   │
│   └── components/               # Shared UI components
│       ├── ui/                   # Base UI (11 components)
│       ├── dashboard/            # Dashboard components (7)
│       └── admin/                # Admin components (9)
│
├── zid/                          # 🆕 ZID E-COMMERCE (separate integration)
│   ├── api/                      # 6 API endpoints
│   │   ├── webhook.ts            # Order webhooks (188 LOC)
│   │   ├── callback.ts           # OAuth callback
│   │   ├── start.ts              # OAuth initiation
│   │   ├── refresh.ts            # Token refresh
│   │   ├── status.ts             # Connection status
│   │   └── disconnect.ts         # Store disconnect
│   ├── lib/                      # 5 library files
│   │   ├── auth.ts               # Token management
│   │   ├── tokens.ts             # Token storage
│   │   └── webhooks.ts           # Webhook verification
│   └── server/                   # State management
│
├── tools/                        # Testing & debugging (11 files)
│   ├── salla-webhook-tester.js   # Webhook simulation
│   ├── test-review-sending.js    # Review flow testing
│   └── loadtest/k6/              # Load tests (3 scripts)
│
├── scripts/                      # Maintenance scripts (10 files)
│   ├── fix-review-order-ids.js   # Data repair
│   ├── export-reviews.mjs        # Data export
│   └── minify-widgets.js         # Build widgets
│
├── functions/                    # Firebase Cloud Functions
├── public/widgets/               # Embeddable widget scripts
└── docs/                         # Documentation (16 files)
```

---

## E-Commerce Platform Integrations

### Salla Integration
- **Location:** `src/pages/api/salla/`
- **Webhook Handler:** 669 lines
- **Events:** app.authorize, subscription.*, order.*, review.added

### Zid Integration  
- **Location:** `/zid/` (standalone)
- **Webhook Handler:** 188 lines
- **Events:** order.delivered, order.cancelled

---

## Security Model

### Rate Limiting
```
Middleware: 20 requests/60 seconds per IP
Public APIs: Configurable via RateLimitPresets
⚠️ Currently in-memory (needs Redis for production scaling)
```

### Firestore Rules
| Collection | Public Read | Write Access |
|------------|-------------|--------------|
| reviews | approved only | Admin/Server |
| stores | No | Owner/Admin |
| orders | No | Owner/Admin |
| tokens | No | Admin only |

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Repository Pattern | Consistent data access, testability |
| Service Layer | Business logic separation |
| Outbox Pattern | Reliable async notifications |
| Feature Flags | Safe gradual rollout |
| Dual Platform | Salla + Zid market coverage |

---

## Dependencies

| Category | Key Packages |
|----------|--------------|
| Framework | Next.js 15.5.4, React 19.1.0 |
| Database | Firebase 12.3.0, Firebase Admin 13.4.0 |
| UI | Radix UI, Framer Motion, TailwindCSS |
| Integrations | SendGrid, OpenAI, OurSMS |
| Testing | Vitest, Playwright, k6 |
