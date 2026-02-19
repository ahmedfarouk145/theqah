# Bug Report: Registration Email Not Sent After Salla App Installation (Revised Analysis)

## Context

Platform: Theqah — a verified-buyer review aggregation SaaS for Salla & Zid e-commerce stores.
After a merchant installs the app on Salla, the webhook handler should send a password setup email.
**The email was never sent** for store `salla:816144827` (mozhelastore2026.com).

This is a **revised analysis** after reviewing concerns raised about the initial report.

---

## Affected Store Data (from Firestore)

```json
{
  "uid": "salla:816144827",
  "provider": "salla",

  "domain": {
    "base": "https://mozhelastore2026.com",
    "key": "mozhelastore2026_com",
    "updatedAt": 1771442225323
  },

  "meta": {
    "updatedAt": 1771442226278,
    "userinfo": {
      "data": {
        "context": {
          "app": 1180703836,
          "exp": 1772651822,
          "scope": "settings.read orders.read products.read webhooks.read_write reviews.read offline_access"
        },
        "created_at": "2024-10-02 11:07:10",
        "email": "sala.helpcenter@gmail.com",
        "id": 5458159,
        "language": "ar",
        "merchant": {
          "avatar": "https://cdn.salla.sa/RAXmyn/RVlJQFgntHSPWFwY4LCzp6yuIzdu8sHacfKp7zsD.png",
          "commercial_number": "6876868768658",
          "created_at": "2024-10-02 11:36:01",
          "currency": "SAR",
          "domain": "https://mozhelastore2026.com/ar",
          "from_competitor": false,
          "id": 816144827,
          "kyc_country": "SA",
          "name": "مذهلة",
          "plan": "pro",
          "referral": { "code": "S4D5Z88V" },
          "status": "active",
          "store_location": "21.3724474,39.7893476",
          "subscription": {
            "days_left": null,
            "end_date": "2027-10-07 00:00:00",
            "is_launched": true,
            "renew": false,
            "status": "active"
          },
          "tax_number": null,
          "type": "company",
          "username": "helpcenter-store-salam"
        },
        "mobile": "+966595350020",
        "name": "HelpCenter",
        "password_reset_required": 0,
        "role": "user"
      },
      "status": 200,
      "success": true
    }
  },

  "salla": {
    "connected": true,
    "domain": "https://mozhelastore2026.com",
    "installed": true,
    "storeId": 816144827,
    "uid": "salla:816144827"
  },

  "plan": {
    "active": true,
    "code": "PAID_MONTHLY",
    "updatedAt": 1771443181072
  },

  "subscription": {
    "planId": "PAID_MONTHLY",
    "raw": {
      "app_name": "Moshtary Moathaq",
      "plan_name": "Unlimited Growth Plan",
      "plan_type": "recurring",
      "price": "20.00",
      "start_date": "2026-02-18",
      "end_date": "2026-03-18",
      "subscription_id": "931412097",
      "subscription_at": "2026-02-18 19:16:58"
    },
    "startedAt": 1771372800000,
    "syncedAt": 1771443181072,
    "updatedAt": 1771443181072
  }
}
```

### Critical Timestamp Analysis

```
domain.updatedAt  = 1771442225323
meta.updatedAt    = 1771442226278
                    ─────────────
                    Δ = 955ms (less than 1 second)

subscription.syncedAt = 1771443181072
                        ─────────────
                        Δ = ~16 minutes later
```

The 955ms gap between `domain.updatedAt` and `meta.updatedAt` **strongly suggests they were written in the same webhook execution**, NOT from separate webhook events. This contradicts the initial analysis that claimed userinfo was populated by a later webhook.

---

## Root Cause Analysis (Two Bugs Found)

### Bug 1: `fetchUserInfo` response structure mismatch (PRIMARY CAUSE)

**File:** `src/lib/sallaClient.ts`

The `UserInfoResponse` TypeScript interface defines the response as:

```typescript
interface UserInfoResponse {
  email?: string;           // ← expects email at top level
  merchant?: { email?: string; ... };
  user?: { email?: string; ... };
}
```

But the ACTUAL Salla API response (as stored in Firestore) wraps everything under a `data` field:

```json
{
  "data": {
    "email": "sala.helpcenter@gmail.com",
    "merchant": { "id": 816144827, "name": "مذهلة", ... }
  },
  "status": 200,
  "success": true
}
```

**File:** `src/pages/api/salla/webhook.ts` — Lines 350, 382-386

The email extraction code treats the response as a flat object:

```typescript
const u = uinfo as Dict;  // u = { data: { email: "..." }, status: 200, success: true }

const infoEmail =
  (typeof u.email === "string" ? u.email : undefined) ??          // u.email → undefined (it's under u.data.email)
  (typeof u.merchant === "object" ? ... : undefined) ??           // u.merchant → undefined (it's under u.data.merchant)
  (typeof u.user === "object" ? ... : undefined);                 // u.user → undefined (it's under u.data.user)
// Result: infoEmail = undefined  ← ALWAYS UNDEFINED regardless of API response
```

**So `infoEmail` is ALWAYS undefined** because the extraction code looks at the wrong nesting level.

### How targetEmail is determined (Lines 382-400)

```typescript
// Source 1: storeInfo API → storeInfo?.data?.email (uses .data accessor correctly)
const storeInfoEmail = storeInfo?.data?.email;

// Source 2: userinfo API → BROKEN (wrong nesting level, see above)
const infoEmail = ... ; // Always undefined due to response structure mismatch

// Source 3: webhook payload → dataRaw.email
const payloadEmail = typeof (dataRaw as Dict)["email"] === "string" ? ... : undefined;

// Final: Priority order
const targetEmail = storeInfoEmail || infoEmail || payloadEmail;
```

So targetEmail depends on:

1. `storeInfoEmail` — works IF `fetchStoreInfo` succeeded
2. `infoEmail` — **ALWAYS broken** due to nesting mismatch
3. `payloadEmail` — works IF the webhook payload contained an email field

**If `fetchStoreInfo` failed or returned no email, AND the payload had no email field, then `targetEmail = undefined` and NO email is sent.**

### Bug 2: Premature `return` on line 175 (SECONDARY CAUSE)

**File:** `src/pages/api/salla/webhook.ts` — Line 175

In the auto-save domain block (lines 134-195), when a custom-domain store's domain is fetched from the Salla API, the code executes `return;` which exits the entire handler before reaching the email-sending code.

```typescript
if (storeUidFromEvent && !baseGeneric && merchantId) {
  // ... fetch domain from API ...
  if (fetchedDomain) {
    await sallaService.saveDomainWithFlags(...);
    return; // ← Exits entire handler, skipping email sending
  }
}
```

**However**, based on the timestamp evidence (955ms gap), this `return` may NOT have fired for this specific store. The domain and userinfo were saved nearly simultaneously, suggesting the code reached Section A (lines 197-441) where both `saveDomainWithFlags` and userinfo saving happen in sequence.

**The `return` bug is still real and dangerous** — it will affect future custom-domain stores where the domain isn't in the payload. But for THIS specific store, the primary cause is likely Bug 1 (response structure mismatch).

---

## Most Likely Scenario for Store salla:816144827

```
1. Webhook app.store.authorize arrives
2. Auto-save domain block runs:
   - The domain WAS in the payload (or baseGeneric was populated)
   - So the !baseGeneric condition was FALSE
   - The return on line 175 was NOT hit
3. Section A runs normally:
   - saveDomainWithFlags runs → writes domain.updatedAt = 1771442225323
   - fetchUserInfo succeeds → data saved to meta.userinfo, meta.updatedAt = 1771442226278
   - fetchStoreInfo runs (in parallel with fetchUserInfo)
4. Email extraction:
   - storeInfoEmail = storeInfo?.data?.email → possibly undefined (if fetchStoreInfo failed or returned no email)
   - infoEmail = undefined (BUG: wrong nesting level)
   - payloadEmail = undefined (no email in webhook payload)
   - targetEmail = undefined
5. targetEmail is falsy → enters else branch → logs "no email found" → NO EMAIL SENT
```

---

## Recommended Fix (Both Bugs)

### Fix 1: Correct the userinfo email extraction (PRIMARY)

```typescript
// Lines 350-386 in webhook.ts
const u = uinfo as Dict;

// NEW: Try to unwrap "data" layer if present (Salla wraps responses)
const uData = (typeof u.data === "object" && u.data !== null) ? (u.data as Dict) : u;

const infoEmail =
  (typeof uData.email === "string" ? uData.email as string : undefined) ??
  (typeof uData.merchant === "object" && typeof (uData.merchant as Dict).email === "string" ? (uData.merchant as Dict).email as string : undefined) ??
  (typeof uData.user === "object" && typeof (uData.user as Dict).email === "string" ? (uData.user as Dict).email as string : undefined) ??
  // Fallback: also check top-level in case API format changes
  (typeof u.email === "string" ? u.email as string : undefined);
```

Also fix the storeName extraction which has the same issue:

```typescript
const storeName =
  (typeof uData.merchant === "object" && typeof (uData.merchant as Dict).name === "string" ? (uData.merchant as Dict).name as string : undefined) ??
  (typeof uData.store === "object" && typeof (uData.store as Dict).name === "string" ? (uData.store as Dict).name as string : undefined) ??
  (storeInfo?.data?.name) ??
  "متجرك";
```

Also fix the custom domain extraction (lines 354-359) which has the same nesting issue:

```typescript
// Use uData instead of u
const merchantUrl = typeof uData.merchant === "object" && typeof (uData.merchant as Dict).url === "string"
  ? (uData.merchant as Dict).url as string : undefined;
const storeUrl = typeof uData.store === "object" && typeof (uData.store as Dict).url === "string"
  ? (uData.store as Dict).url as string : undefined;
```

### Fix 2: Remove premature return (SECONDARY)

```diff
  if (fetchedDomain) {
    await sallaService.saveDomainWithFlags(storeUidFromEvent, merchantId, fetchedDomain, event);
    await sallaService.saveDomainVariations(storeUidFromEvent, fetchedDomain);
-   return; // Exit early after successful fetch
+   // Domain saved — continue with normal event processing
  }
```

### Fix 3: Add explicit fallback log when targetEmail is null

Already exists at line 431:

```typescript
await fbLog(db, { level: "debug", scope: "password_email", msg: "no email found in store_info/userinfo/payload", ... });
```

But should be changed from `debug` to `warn` level for better visibility.

---

## Summary

| Bug | Severity | Impact | Fix |
|-----|----------|--------|-----|
| UserInfo response nesting mismatch | **HIGH** | `infoEmail` is ALWAYS undefined for all stores | Unwrap `data` layer before extracting fields |
| Premature `return` in domain block | **MEDIUM** | Skips entire handler for custom-domain stores when domain not in payload | Remove `return;` on line 175 |
| `targetEmail` null log is `debug` level | **LOW** | Silent failure makes debugging harder | Change to `warn` level |

Both fixes should be applied together to ensure password setup emails are reliably sent for all stores.
