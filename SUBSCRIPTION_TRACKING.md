# Subscription Tracking System

## Overview

The subscription tracking system monitors and manages store subscription plans, usage limits, and billing status for Salla-integrated stores. It handles subscription updates from webhooks, syncs with Salla API, and enforces usage quotas.

---

## Architecture

### Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                   Subscription Data Sources                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Salla Webhooks (Real-time)                                 │
│     ├─ app.subscription.* events                               │
│     ├─ app.trial.* events                                       │
│     └─ Payload: { plan_name, plan_type, ... }                   │
│                                                                 │
│  2. Salla API (On-demand Sync)                                 │
│     ├─ GET /admin/v2/stores/{storeUid}/subscriptions           │
│     └─ Returns: Array of subscription objects                  │
│                                                                 │
│  3. Manual Sync (Admin Panel)                                  │
│     └─ Force refresh via /api/admin/subscription               │
│                                                                 │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│              Subscription Processing Layer                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Webhook Handler (src/pages/api/salla/webhook.ts)           │
│     ├─ Detects subscription events                             │
│     ├─ Maps Salla plan names → Internal plan IDs               │
│     └─ Updates Firestore stores collection                     │
│                                                                 │
│  2. API Sync Handler (src/pages/api/admin/subscription.ts)     │
│     ├─ Fetches from Salla API                                  │
│     ├─ Caches with 6-hour TTL                                  │
│     └─ Updates if changed                                      │
│                                                                 │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│              Firestore Data Structure                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  stores/{storeUid}                                              │
│  └─ subscription: {                                             │
│       planId: "P30" | "P60" | "P120" | "ELITE" | "TRIAL",     │
│       raw: { ... },           // Full Salla response          │
│       syncedAt: 1234567890,    // Timestamp                    │
│       updatedAt: 1234567890    // Last update                  │
│     }                                                            │
│                                                                 │
│  usage: {                                                       │
│     monthKey: "2025-01",      // YYYY-MM format                │
│     invitesUsed: 15,           // Current month count           │
│     updatedAt: 1234567890      // Last increment               │
│   }                                                              │
│                                                                 │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│              Usage Enforcement & Quota Checking                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Before Sending Invite                                      │
│     ├─ Check canSendInvite(storeUid)                           │
│     ├─ Verify plan is active                                   │
│     ├─ Compare invitesUsed < invitesLimit                      │
│     └─ Return { ok: boolean, reason?: string }                 │
│                                                                 │
│  2. After Successful Invite                                    │
│     ├─ Increment invitesUsed counter                           │
│     ├─ Reset counter if new month                             │
│     └─ Update usage field atomically                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Subscription Plans

### Plan Types & Limits

| Plan ID | Name (Arabic) | Price (SAR) | Invites/Month | Status |
|---------|--------------|-------------|---------------|--------|
| `TRIAL` | باقة التجربة | 0 | 5 | Trial |
| `P30` | باقة البداية | 30 | 40 | Paid |
| `P60` | باقة النمو | 60 | 90 | Paid (Highlighted) |
| `P120` | باقة التوسع | 120 | 200 | Paid |
| `ELITE` | باقة النخبة | Custom | Unlimited (500+) | Enterprise |

### Plan Mapping (Salla → Internal)

**From Webhooks:**
```typescript
const map: Record<string, string> = {
  "start": "P30",
  "growth": "P60", 
  "scale": "P120",
  "elite": "ELITE",
  "trial": "TRIAL"
};
```

**From API Sync:**
- Uses `mapSallaPlanToInternal()` function
- Currently placeholder implementation
- Needs to be updated based on actual Salla plan names

---

## Data Sources

### 1. Salla Webhook Events

**Event Types:**
- `app.subscription.*` - Subscription changes
- `app.trial.*` - Trial period events

**Webhook Payload Structure:**
```typescript
{
  event: "app.subscription.activated" | "app.subscription.updated" | "app.trial.started",
  merchant: "123456789",           // Store ID
  created_at: "2025-01-01T10:00:00Z",
  data: {
    plan_name?: string,           // "start", "growth", "scale", "elite", "trial"
    plan_type?: string,           // Optional type field
    name?: string,                 // Alternative field name
    // ... other subscription fields
  }
}
```

**Processing Logic:**
```typescript
// src/pages/api/salla/webhook.ts (lines 776-795)
if (event.startsWith("app.subscription.") || event.startsWith("app.trial.")) {
  const planName = String(payload["plan_name"] ?? payload["name"] ?? "").toLowerCase();
  const map: Record<string, string> = { 
    start: "P30", 
    growth: "P60", 
    scale: "P120", 
    elite: "ELITE", 
    trial: "TRIAL" 
  };
  const planId = (map[planName] || "").toUpperCase() || 
                 (event.includes(".trial.") ? "TRIAL" : "P30");
  
  // Update Firestore
  await db.collection("stores").doc(storeUid).set({
    subscription: { planId, raw: payload, updatedAt: Date.now() }
  }, { merge: true });
}
```

### 2. Salla API Sync

**Endpoint:**
```
GET https://api.salla.dev/admin/v2/stores/{storeUid}/subscriptions
```

**Authentication:**
- Uses `SALLA_API_TOKEN` environment variable
- Requires app-level token (not store-specific)

**Response Structure:**
```typescript
{
  data?: Array<{
    plan_name?: string,
    plan_type?: string,
    name?: string,
    // ... other subscription fields
  }>
}
```

**Sync Logic:**
```typescript
// src/pages/api/admin/subscription.ts
async function syncSubscription(storeUid: string) {
  const raw = await fetchAppSubscriptions(storeUid);
  const arr = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
  const first = arr.length ? arr[0] : null;
  const planName = first?.plan_name ?? first?.name ?? null;
  const planType = first?.plan_type ?? null;
  const planId = mapSallaPlanToInternal(planName, planType);
  
  // Update if changed
  await ref.set({
    subscription: { planId, raw, syncedAt: Date.now() }
  }, { merge: true });
}
```

**Caching:**
- TTL: **6 hours** (`TTL_MS = 6 * 60 * 60 * 1000`)
- Returns cached data if fresh
- Force refresh with `?force=1` query parameter

---

## Storage Structure

### Firestore Document: `stores/{storeUid}`

```typescript
{
  uid: "salla:123456789",
  provider: "salla",
  
  // Subscription data
  subscription?: {
    planId?: "TRIAL" | "P30" | "P60" | "P120" | "ELITE",
    raw?: {
      // Full subscription object from Salla
      plan_name?: string,
      plan_type?: string,
      // ... all other fields
    },
    syncedAt?: number,        // Timestamp of last sync
    updatedAt?: number        // Timestamp of last update
  },
  
  // Usage tracking (monthly)
  usage?: {
    monthKey?: string,        // "2025-01" format
    invitesUsed?: number,     // Count for current month
    updatedAt?: number        // Last increment timestamp
  },
  
  updatedAt?: number
}
```

### Status Calculation

```typescript
function deriveStatus(store: StoreDoc, invitesUsed: number): Status {
  const planId = store.subscription?.planId;
  
  if (!planId) return "no_plan";
  if (planId === "TRIAL") return invitesUsed >= 5 ? "over_quota" : "trial";
  
  // Check if subscription is stale (>35 days old)
  const syncedAt = store.subscription?.syncedAt;
  const stale = syncedAt && (Date.now() - syncedAt > 35 * 24 * 60 * 60 * 1000);
  if (stale) return "lapsed";
  
  // Check quota
  const limit = PLAN_LIMITS[planId];
  if (limit !== null && invitesUsed >= limit) return "over_quota";
  
  return "active";
}
```

**Status Types:**
- `active` - Subscription active and within quota
- `over_quota` - Subscription active but exceeded monthly limit
- `trial` - Trial plan active
- `lapsed` - Subscription not renewed (sync >35 days old)
- `no_plan` - No subscription assigned

---

## API Endpoints

### 1. Get Subscription (Admin)

**Endpoint:** `GET /api/admin/subscription?storeUid={storeUid}&force={0|1}`

**Authentication:** Admin only (requires admin token)

**Query Parameters:**
- `storeUid` (required) - Store UID (e.g., "salla:123456789")
- `force` (optional) - Force refresh (1) or use cache (0)

**Response:**
```typescript
{
  ok: true,
  subscription: {
    planId: "P30",
    raw: { ... },           // Full Salla response
    syncedAt: 1234567890
  },
  cached: false,           // Whether response was cached
  stale?: true              // If sync failed, data may be stale
}
```

**Example:**
```bash
curl -H "Authorization: Bearer {admin_token}" \
  "https://app.com/api/admin/subscription?storeUid=salla:123456789&force=1"
```

### 2. List All Subscriptions (Admin)

**Endpoint:** `GET /api/admin/subscriptions`

**Authentication:** Admin only

**Response:**
```typescript
{
  ok: true,
  grouped: {
    active: ApiStoreItem[],
    over_quota: ApiStoreItem[],
    trial: ApiStoreItem[],
    lapsed: ApiStoreItem[],
    no_plan: ApiStoreItem[],
    all: ApiStoreItem[]
  },
  count: number,
  month: "2025-01"           // Current month key
}
```

**ApiStoreItem:**
```typescript
{
  storeUid: string,
  domainBase?: string,
  planId?: PlanId,
  invitesUsed?: number,
  invitesLimit?: number | null,
  status: "active" | "over_quota" | "trial" | "lapsed" | "no_plan",
  sallaInstalled?: boolean,
  sallaConnected?: boolean,
  lastUpdate?: number
}
```

---

## Usage Tracking

### Monthly Usage Cycle

**Month Key Format:** `YYYY-MM` (UTC-based)

```typescript
function monthKey(ts: number = Date.now()): string {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
```

### Usage Increment

**When:** After successfully sending review invitation

**Logic:**
```typescript
// src/server/subscription/usage.ts
async function onInviteSent(storeUid: string) {
  const key = monthKey();
  const ref = db.collection("stores").doc(storeUid);
  
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() || {};
    const usage = data.usage || {};
    
    if (usage.monthKey === key) {
      // Same month - increment
      tx.update(ref, {
        usage: {
          monthKey: key,
          invitesUsed: (usage.invitesUsed || 0) + 1,
          updatedAt: Date.now()
        }
      });
    } else {
      // New month - reset to 1
      tx.update(ref, {
        usage: {
          monthKey: key,
          invitesUsed: 1,
          updatedAt: Date.now()
        }
      });
    }
  });
}
```

### Quota Checking

**Before Sending Invite:**
```typescript
// src/server/billing/usage.ts
async function canSendInvite(storeUid: string) {
  const snap = await db.collection("stores").doc(storeUid).get();
  const s = snap.data() || {};
  
  // Check plan is active
  if (!s?.plan?.active) {
    return { ok: false, reason: "plan_inactive" };
  }
  
  // Get plan limits
  const planCode = s.plan.code || "TRIAL";
  const cfg = getPlanConfig(planCode);
  const used = s.usage?.invitesUsed ?? 0;
  
  // Check quota
  if (used >= cfg.monthlyInvites) {
    return { 
      ok: false, 
      reason: "quota_exhausted", 
      used, 
      limit: cfg.monthlyInvites 
    };
  }
  
  return { ok: true, used, limit: cfg.monthlyInvites };
}
```

---

## Admin Dashboard

### Admin Subscriptions Component

**Location:** `src/components/admin/AdminSubscriptions.tsx`

**Features:**
1. **View All Subscriptions**
   - Filter by status (active, over_quota, trial, lapsed, no_plan)
   - Filter by plan (TRIAL, P30, P60, P120, ELITE)
   - Search by store UID, domain, or plan

2. **Manual Sync**
   - Sync individual stores with Salla API
   - Force refresh subscription data
   - Real-time status updates

3. **Grouped Views**
   - **Subscribed Stores**: active, over_quota, trial
   - **Not Renewed**: lapsed, no_plan
   - Color-coded status badges

**UI Features:**
- Search/filter functionality
- Status badges with colors
- Usage display (used/limit)
- Sync button per store
- Refresh all button

---

## Configuration

### Environment Variables

```bash
# Salla API Token (for subscription sync)
SALLA_API_TOKEN=sk_live_...

# Webhook Secret/Token (for webhook verification)
SALLA_WEBHOOK_SECRET=...
SALLA_WEBHOOK_TOKEN=...

# Base URL
APP_BASE_URL=https://theqah.com.sa
```

### Plan Limits Configuration

**Location:** `src/config/plans.ts` and `src/pages/api/admin/subscriptions/index.ts`

```typescript
const PLAN_LIMITS: Record<PlanId, number | null> = {
  TRIAL: 5,      // 5 invites/month
  P30: 40,       // 40 invites/month
  P60: 90,       // 90 invites/month
  P120: 200,     // 200 invites/month
  ELITE: null     // Unlimited (null = no limit)
};
```

---

## Important Notes

### 1. Plan Mapping Issue

⚠️ **Current Issue:** The `mapSallaPlanToInternal()` function in `src/config/plans.ts` is a placeholder and doesn't correctly map Salla plan names to internal plan IDs.

**Current Implementation:**
```typescript
export function mapSallaPlanToInternal(planName?: string | null, planType?: string | null): string {
  if (!planName) return "free";
  if (planName.includes("Pro")) return "pro";
  if (planName.includes("Plus")) return "plus";
  if (planType === "enterprise") return "enterprise";
  return "free";
}
```

**Should Be:**
```typescript
export function mapSallaPlanToInternal(planName?: string | null, planType?: string | null): string | null {
  if (!planName) return null;
  
  const normalized = String(planName).toLowerCase().trim();
  
  // Map common Salla plan names
  const mapping: Record<string, string> = {
    "start": "P30",
    "growth": "P60",
    "scale": "P120",
    "elite": "ELITE",
    "trial": "TRIAL",
    // Add actual Salla plan names here
  };
  
  return mapping[normalized] || null;
}
```

### 2. Fetch App Subscriptions

⚠️ **Current Issue:** The `fetchAppSubscriptions()` function uses a static API token and may not work correctly for store-specific subscriptions.

**Current Implementation:**
```typescript
export async function fetchAppSubscriptions(storeUid: string): Promise<unknown> {
  const url = `https://api.salla.dev/admin/v2/stores/${encodeURIComponent(storeUid)}/subscriptions`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${process.env.SALLA_API_TOKEN}`,  // Static token
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`Failed to fetch subscriptions: ${res.status}`);
  return await res.json();
}
```

**Should Use Store-Specific Token:**
- Get access token from `owners/{storeUid}` collection
- Use store's OAuth token for API calls
- Fallback to app token if store token unavailable

### 3. Subscription API Endpoint

The actual Salla API endpoint for subscriptions may differ. Verify with Salla documentation:
- Current: `/admin/v2/stores/{storeUid}/subscriptions`
- May be: `/admin/v2/subscriptions` or `/apps/subscriptions`

---

## Usage Examples

### 1. Check Subscription Before Sending Invite

```typescript
import { canSendInvite } from "@/server/billing/usage";

const check = await canSendInvite("salla:123456789");

if (!check.ok) {
  if (check.reason === "quota_exhausted") {
    console.log(`Quota exceeded: ${check.used}/${check.limit}`);
  } else if (check.reason === "plan_inactive") {
    console.log("Plan is inactive");
  }
  return;
}

// Proceed with sending invite
await sendInvite(...);
await onInviteSent("salla:123456789");
```

### 2. Sync Subscription Manually

```typescript
// Admin endpoint
const response = await fetch(
  `/api/admin/subscription?storeUid=salla:123456789&force=1`,
  {
    headers: { Authorization: `Bearer ${adminToken}` }
  }
);

const data = await response.json();
console.log("Subscription:", data.subscription);
```

### 3. Get Usage for Current Month

```typescript
const snap = await db.collection("stores").doc(storeUid).get();
const store = snap.data();
const usage = store?.usage || {};
const currentMonth = monthKey();

if (usage.monthKey === currentMonth) {
  console.log(`Used: ${usage.invitesUsed}/${getInvitesLimit(store.subscription?.planId)}`);
} else {
  console.log("New month - usage reset to 0");
}
```

---

## Troubleshooting

### Subscription Not Updating

1. **Check Webhook Receipt**
   - Verify webhook is being received
   - Check `webhooks_salla` collection for event logs
   - Verify signature/token validation

2. **Check API Sync**
   - Verify `SALLA_API_TOKEN` is set
   - Check API endpoint is correct
   - Verify store UID format (`salla:123456789`)

3. **Check Firestore Updates**
   - Verify subscription field is being written
   - Check `syncedAt` timestamp is recent
   - Verify plan mapping logic

### Quota Issues

1. **Usage Not Incrementing**
   - Check `onInviteSent()` is called after successful send
   - Verify transaction is completing
   - Check `monthKey()` matches current month

2. **Quota Always Exceeded**
   - Verify plan limits in `PLAN_LIMITS`
   - Check usage counter is correct
   - Verify month reset is working

### Status Calculation Issues

1. **Always Showing "lapsed"**
   - Check `syncedAt` timestamp is recent (<35 days)
   - Verify subscription sync is running
   - Check webhook processing

2. **Wrong Status**
   - Verify status calculation logic
   - Check plan ID is correctly set
   - Verify usage count is accurate

---

## Future Enhancements

1. **Improved Plan Mapping**
   - Update `mapSallaPlanToInternal()` with actual Salla plan names
   - Support multiple plan name variations
   - Handle plan upgrades/downgrades

2. **Better API Integration**
   - Use store-specific OAuth tokens
   - Implement token refresh logic
   - Add retry logic for failed syncs

3. **Subscription Analytics**
   - Track subscription changes over time
   - Report on subscription lifecycle
   - Monitor trial conversions

4. **Automated Quota Management**
   - Send warnings at 80% usage
   - Block invites when quota exceeded
   - Notify admins of over-quota stores

5. **Billing Integration**
   - Track subscription payments
   - Handle subscription renewals
   - Manage subscription cancellations

---

## Related Files

- `src/pages/api/salla/webhook.ts` - Webhook handler for subscription events
- `src/pages/api/admin/subscription.ts` - Subscription sync endpoint
- `src/pages/api/admin/subscriptions/index.ts` - List all subscriptions
- `src/server/subscription/get-on-demand.ts` - Get fresh subscription data
- `src/server/subscription/usage.ts` - Usage tracking functions
- `src/server/billing/usage.ts` - Quota checking functions
- `src/server/billing/plans.ts` - Plan configuration
- `src/config/plans.ts` - Plan definitions and mapping
- `src/components/admin/AdminSubscriptions.tsx` - Admin dashboard UI
- `src/lib/sallaClient.ts` - Salla API client functions

---

## Summary

The subscription tracking system provides:

✅ **Real-time updates** via Salla webhooks  
✅ **On-demand sync** via Salla API  
✅ **Usage tracking** with monthly cycles  
✅ **Quota enforcement** before sending invites  
✅ **Admin dashboard** for monitoring  
✅ **Status calculation** (active, over_quota, trial, lapsed, no_plan)

**Current Limitations:**

⚠️ Plan mapping needs real Salla plan names  
⚠️ API sync uses static token instead of store OAuth  
⚠️ Subscription API endpoint may need verification

