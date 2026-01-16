# Architecture Overview

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Frontend (Next.js)                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐      │
│  │  Public Reviews  │    │  Dashboard Page  │    │  Review Submit   │      │
│  │   (Approved)     │    │  ┌────────────┐  │    │      Form        │      │
│  │                  │    │  │ Analytics  │  │    │                  │      │
│  │  GET /api/public │    │  │  Orders    │  │    │  POST /submit    │      │
│  │  reviews         │    │  │  Reviews   │  │    │                  │      │
│  └─────────┬────────┘    │  │  Settings  │  │    └─────────┬────────┘      │
│            │             │  │  Support   │  │              │                │
│            │             │  └────────────┘  │              │                │
│            │             │  ┌────────────┐  │              │                │
│            │             │  │ PENDING    │◄─┤ Feature      │                │
│            │             │  │ REVIEWS    │  │ Flag         │                │
│            │             │  │ (V2)       │  │ DASHBOARD_V2 │                │
│            │             │  └────────────┘  │              │                │
│            │             └────────┬─────────┘              │                │
└────────────┼──────────────────────┼────────────────────────┼────────────────┘
             │                      │                        │
             │                      │                        │
        ┌────▼──────────────────────▼────────────────────────▼────┐
        │                    API Routes                            │
        ├──────────────────────────────────────────────────────────┤
        │                                                           │
        │  GET /api/reviews?status=approved    (Public)            │
        │  GET /api/reviews?status=pending     (Auth Required)     │
        │  POST /api/reviews/submit            (Creates Pending)   │
        │  POST /api/reviews/update-status     (Auth Required)     │
        │                                                           │
        └────────────────────┬──────────────────────┬──────────────┘
                             │                      │
                             │                      │
        ┌────────────────────▼──────────────────────▼──────────────┐
        │                  Firestore Database                       │
        ├──────────────────────────────────────────────────────────┤
        │                                                           │
        │  reviews/{id}                                             │
        │  ├─ status: 'pending' | 'approved' | 'rejected'          │
        │  ├─ published: boolean                                   │
        │  ├─ stars, text, images, createdAt                       │
        │  └─ storeUid, productId, moderation                      │
        │                                                           │
        │  outbox_jobs/{id}                                         │
        │  ├─ type: 'merchant_review_approval_needed'              │
        │  ├─ status: 'pending' | 'leased' | 'ok' | 'fail'        │
        │  ├─ channels: ['email']                                  │
        │  └─ payload: { merchantEmail, reviewId, ... }           │
        │                                                           │
        │  short_links/{code}                                       │
        │  ├─ targetUrl: string                                    │
        │  ├─ hits: number                                         │
        │  ├─ ownerStoreId: string                                 │
        │  └─ createdAt, lastHitAt                                 │
        │                                                           │
        └────────────────────┬──────────────────────┬──────────────┘
                             │                      │
                             │                      │
        ┌────────────────────▼──────────┐  ┌────────▼──────────────┐
        │  Firestore Triggers           │  │  Outbox Worker        │
        │  (Server-side)                │  │  (Background Process) │
        ├───────────────────────────────┤  ├───────────────────────┤
        │                               │  │                       │
        │  onCreate(review)             │  │  1. Lease jobs        │
        │    ├─ if status=pending       │  │  2. Process channels  │
        │    └─ enqueue notification    │  │     ├─ Send email     │
        │                               │  │     └─ Send SMS       │
        └───────────────┬───────────────┘  │  3. Mark complete     │
                        │                  │  4. Requeue on fail   │
                        │                  │                       │
                        └──────────────────┴───────────────────────┘
                                           │
                                           ▼
                                  ┌────────────────┐
                                  │ Email Service  │
                                  │  (SendGrid)    │
                                  └────────────────┘
```

## Review Approval Flow

```
Customer                 System                  Merchant                Database
   │                       │                         │                       │
   │                       │                         │                       │
   ├─ Submit Review ──────►│                         │                       │
   │                       │                         │                       │
   │                       ├─ Create Review ────────►│                       │
   │                       │   status: 'pending'     │                       │
   │                       │   published: false      │                       │
   │                       │                         │                       │
   │                       ├─ Trigger onCreate ──────┤                       │
   │                       │                         │                       │
   │                       ├─ Enqueue Job ──────────►│                       │
   │                       │   type: approval_needed │                       │
   │                       │                         │                       │
   │                       │                         │                       │
   │                  [Outbox Worker]                │                       │
   │                       │                         │                       │
   │                       ├─ Process Job           │                       │
   │                       │                         │                       │
   │                       ├─ Send Email ────────────►                       │
   │                       │   "Review needs         │                       │
   │                       │    approval"            │                       │
   │                       │                         │                       │
   │                       │                         │                       │
   │                       │          Merchant Opens Dashboard               │
   │                       │                         │                       │
   │                       │                    ┌────┴─────┐                 │
   │                       │                    │ DASHBOARD│                 │
   │                       │                    │   V2     │                 │
   │                       │                    │ (Pending │                 │
   │                       │                    │ Reviews) │                 │
   │                       │                    └────┬─────┘                 │
   │                       │                         │                       │
   │                       │              Click "Approve"                    │
   │                       │                         │                       │
   │                       │◄────POST /update-status─┤                       │
   │                       │   { status: 'approved' }│                       │
   │                       │                         │                       │
   │                       ├─ Update Review ────────►│                       │
   │                       │   status: 'approved'    │                       │
   │                       │   published: true       │                       │
   │                       │   publishedAt: now      │                       │
   │                       │                         │                       │
   │◄──Review Visible──────┤                         │                       │
   │   (Public Page)       │                         │                       │
   │                       │                         │                       │
```

## Short Link Flow

```
User                     System                  Database
 │                         │                         │
 │                         │                         │
 ├─ Create Short Link ────►│                         │
 │   (Server/API)          │                         │
 │                         │                         │
 │                         ├─ Generate Code ────────►│
 │                         │   abc12345              │
 │                         │                         │
 │                         ├─ Store Link ───────────►│
 │                         │   targetUrl             │
 │                         │   ownerStoreId          │
 │                         │   hits: 0               │
 │                         │                         │
 │◄── /r/abc12345 ─────────┤                         │
 │                         │                         │
 │                         │                         │
 │                         │                         │
 │  Customer Visits Link   │                         │
 │                         │                         │
 ├─ GET /r/abc12345 ───────►                         │
 │                         │                         │
 │                         ├─ Lookup Code ──────────►│
 │                         │                         │
 │                         │◄─ Return Target ────────┤
 │                         │   targetUrl             │
 │                         │                         │
 │                         ├─ Increment Hits ───────►│
 │                         │   hits: hits + 1        │
 │                         │   lastHitAt: now        │
 │                         │                         │
 │◄── 302 Redirect ────────┤                         │
 │    Location: targetUrl  │                         │
 │                         │                         │
```

## Feature Flag System

```
┌────────────────────────────────────────────────────┐
│              Feature Flag System                   │
├────────────────────────────────────────────────────┤
│                                                    │
│  Flag Definition:                                  │
│  ┌──────────────────────────────────────────────┐ │
│  │ const FLAGS = {                              │ │
│  │   DASHBOARD_V2: false  // Default OFF        │ │
│  │ }                                            │ │
│  └──────────────────────────────────────────────┘ │
│                                                    │
│  Override Sources (Priority):                      │
│  ┌──────────────────────────────────────────────┐ │
│  │ 1. Environment Variable                      │ │
│  │    NEXT_PUBLIC_FLAG_DASHBOARD_V2=true        │ │
│  │                                              │ │
│  │ 2. Remote Config (Future)                    │ │
│  │    Firestore: config/flags/DASHBOARD_V2      │ │
│  │                                              │ │
│  │ 3. Default Value                             │ │
│  │    From FLAGS constant                       │ │
│  └──────────────────────────────────────────────┘ │
│                                                    │
│  Usage:                                            │
│  ┌──────────────────────────────────────────────┐ │
│  │ const enabled = useFlag('DASHBOARD_V2');     │ │
│  │                                              │ │
│  │ if (enabled) {                               │ │
│  │   return <NewFeature />;                     │ │
│  │ }                                            │ │
│  └──────────────────────────────────────────────┘ │
│                                                    │
└────────────────────────────────────────────────────┘
```

## Security Model

```
┌─────────────────────────────────────────────────────────┐
│                  Firestore Security Rules                │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  reviews/{id}                                            │
│  ├─ Public Read:  status == 'approved'                  │
│  ├─ Merchant Read: storeUid == auth.uid                 │
│  ├─ Admin Read:   token.admin == true                   │
│  └─ Write:        Admin/Server only                     │
│                                                          │
│  short_links/{code}                                      │
│  ├─ Read:  Admin/Server only                            │
│  └─ Write: Admin/Server only                            │
│                                                          │
│  outbox_jobs/{id}                                        │
│  ├─ Read:  Admin/Server only                            │
│  └─ Write: Admin/Server only                            │
│                                                          │
│  API Authentication                                      │
│  ├─ /api/reviews?status=pending                         │
│  │   └─ Requires: Firebase Auth Token                   │
│  │                                                       │
│  ├─ /api/reviews/update-status                          │
│  │   └─ Requires: Firebase Auth Token                   │
│  │                + Store Ownership Verification         │
│  │                                                       │
│  └─ /api/reviews/submit                                 │
│      └─ Public (Rate limited by outbox)                 │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

## Deployment Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Production Deployment                  │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  ┌───────────────────────────────────────────────────┐   │
│  │                Next.js Frontend                    │   │
│  │        (Vercel / Your Hosting Platform)           │   │
│  │                                                    │   │
│  │  Environment Variables:                            │   │
│  │  ├─ NEXT_PUBLIC_FLAG_DASHBOARD_V2=false (default) │   │
│  │  ├─ NEXT_PUBLIC_FIREBASE_CONFIG                   │   │
│  │  └─ NEXT_PUBLIC_BASE_URL                          │   │
│  └────────────────────┬──────────────────────────────┘   │
│                       │                                   │
│                       │                                   │
│  ┌────────────────────▼──────────────────────────────┐   │
│  │              Firebase Backend                      │   │
│  │                                                    │   │
│  │  ┌──────────────────────────────────────────────┐ │   │
│  │  │ Firestore Database                           │ │   │
│  │  │  ├─ reviews                                  │ │   │
│  │  │  ├─ short_links                              │ │   │
│  │  │  ├─ outbox_jobs                              │ │   │
│  │  │  └─ stores                                   │ │   │
│  │  └──────────────────────────────────────────────┘ │   │
│  │                                                    │   │
│  │  ┌──────────────────────────────────────────────┐ │   │
│  │  │ Security Rules (Deployed)                    │ │   │
│  │  │  firebase deploy --only firestore:rules      │ │   │
│  │  └──────────────────────────────────────────────┘ │   │
│  │                                                    │   │
│  └────────────────────────────────────────────────────┘   │
│                                                           │
│  ┌───────────────────────────────────────────────────┐   │
│  │           Outbox Worker Process                    │   │
│  │      (Separate Process/Container)                 │   │
│  │                                                    │   │
│  │  node src/worker/outbox-worker.ts                 │   │
│  │                                                    │   │
│  │  ├─ Polls outbox_jobs every N seconds            │   │
│  │  ├─ Sends email notifications                     │   │
│  │  ├─ Handles retries with backoff                  │   │
│  │  └─ Moves failed jobs to DLQ                      │   │
│  └───────────────────────────────────────────────────┘   │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

## Testing Infrastructure

```
┌────────────────────────────────────────────────────────┐
│                  Testing Layers                         │
├────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Unit Tests (Future)                             │  │
│  │  - Review trigger logic                          │  │
│  │  - Status validation                             │  │
│  │  - Short link generation                         │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Load Tests (k6)                                 │  │
│  │  ├─ tools/loadtest/k6/redirect-test.js          │  │
│  │  │   └─ Short link performance                  │  │
│  │  ├─ tools/loadtest/k6/review-create-test.js     │  │
│  │  │   └─ Review submission load                  │  │
│  │  └─ tools/loadtest/k6/outbox-jobs-test.js       │  │
│  │      └─ Job processing capacity                 │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │  E2E Tests (Playwright)                          │  │
│  │  ├─ tests/e2e/review-approval.spec.ts           │  │
│  │  │   └─ Complete approval workflow              │  │
│  │  └─ tests/e2e/shortlink-redirect.spec.ts        │  │
│  │      └─ Redirect verification                   │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Quality Checks                                  │  │
│  │  ├─ npm run lint                                 │  │
│  │  ├─ npm run build                                │  │
│  │  └─ node tools/verify-installation.js           │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
└────────────────────────────────────────────────────────┘
```

---

## Key Design Decisions

### 1. Feature Flags
**Decision:** All new UI features behind runtime flags
**Reason:** Safe gradual rollout, instant rollback capability
**Trade-off:** Slightly more complex code, but worth the safety

### 2. Outbox Pattern
**Decision:** Use outbox queue for notifications
**Reason:** Reliable delivery, retry logic, decoupled processing
**Trade-off:** Requires worker process, but provides resilience

### 3. Status-Based Security
**Decision:** Filter reviews by status in Firestore rules
**Reason:** Database-level security, prevents data leaks
**Trade-off:** Cannot use some Firestore features, but maximizes security

### 4. Backward Compatibility
**Decision:** Keep all existing APIs unchanged
**Reason:** Zero-risk deployment, no migration needed
**Trade-off:** Some code duplication, but ensures stability

---

## Performance Considerations

### Database Queries
- Reviews filtered at database level for efficiency
- Indexes required for status-based queries
- Pagination supported via existing patterns

### Short Links
- Direct document lookup by ID (O(1))
- Hit counter updated asynchronously
- No impact on redirect speed

### Notifications
- Processed asynchronously via worker
- Rate limiting prevents spam
- Retry logic with exponential backoff

### Feature Flags
- Evaluated once at component mount
- Environment variable caching
- Minimal performance impact

---

This architecture provides a robust, scalable foundation for the new features while maintaining security and backward compatibility.
