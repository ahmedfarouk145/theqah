# Verification Layer Privacy Scope

Last reviewed: 2026-03-10

## Purpose

This document defines the correct privacy, transparency, deletion, and retention scope for TheQah as it exists today.

The key constraint is:

- TheQah does **not** control the original review UI shown by Salla or Zid.
- TheQah **does** control:
  - the trust certificate / logo / verification badge layer
  - TheQah-managed review-linked data stored in its own database
  - TheQah verification metadata
  - TheQah operational and audit logs

This scope matters because buyer-facing rights and disclosures must match what TheQah actually controls.

## Current Product Reality

Current code suggests this model:

- TheQah adds trust messaging through the widget in `public/widgets/theqah-widget.js`
- TheQah keeps local review and verification data in Firestore
- Salla native reviews are ingested in `src/backend/server/services/salla-webhook.service.ts`
- Zid reviews are synced in `src/backend/server/services/zid-review-sync.service.ts`
- Public trust/profile APIs are exposed through:
  - `src/pages/api/reviews/check-verified.ts`
  - `src/pages/api/public/store-profile.ts`
- Generic support/reporting currently exists in `src/backend/server/services/support.service.ts`

TheQah therefore acts as a **verification layer**, not the sole controller of the original source-platform review experience.

## What TheQah Can Control

- The certificate/logo copy and behavior in the widget
- TheQah-held review-linked metadata
- TheQah-held verification decisions and verification markers
- Public TheQah APIs and public TheQah pages
- TheQah support/data request workflow
- TheQah retention and deletion rules for its own systems

## What TheQah Cannot Fully Control

- Whether the original Salla/Zid review UI is shown on the merchant storefront
- Whether the merchant platform deletes the original platform-native review
- How long Salla/Zid retains its own source data
- Merchant platform UI wording outside TheQah-controlled surfaces

Because of that, TheQah must not promise:

- "delete the original review everywhere"
- "remove the review from the source platform"
- "control all buyer-facing review rendering"

Instead, TheQah should promise only what it can actually do.

## 1. Buyer-Facing Explanation

### Correct requirement

Add a clear explanation on TheQah-controlled trust surfaces that verification is performed programmatically via Salla/Zid order signals.

### Why this matters

Without this, a buyer may assume:

- the merchant manually approved the badge
- the badge is purely marketing
- TheQah controls the original review text and placement

### What the explanation should say

The message should be short and operationally accurate. Example meaning:

- TheQah verifies review credibility programmatically using Salla/Zid order signals such as order and payment status.
- TheQah does not use card data.
- TheQah may not control the original review display on the store page.

### Where it should appear

Because TheQah only controls the certificate/logo layer, the explanation should appear on:

- the certificate badge in `public/widgets/theqah-widget.js`
- a tooltip or info icon attached to the badge
- a linked TheQah page with fuller explanation

### Minimum implementation

- Add a small info icon beside the certificate/badge
- Open a modal, popover, or external page
- Explain verification scope in plain language

## 2. Visible Privacy / Help Entry Point

### Correct requirement

Add a visible privacy/help entry point from TheQah-controlled public trust surfaces.

### Why this matters

A privacy policy link in the global site footer is not enough if the buyer only sees the badge/logo in the store context.

### What this should look like

The certificate/logo surface should include one of:

- `Learn how verification works`
- `Privacy & data requests`
- `How verified buyer works`

### Where it should link

Recommended destinations:

- `/privacy-policy#buyer-rights`
- `/support`
- a dedicated page such as `/data-request`

### Scope clarification

This entry point should explicitly say that requests concern:

- TheQah-managed verification data
- TheQah-managed local review-linked data
- TheQah-controlled trust markers

and may not automatically affect the original platform-native review.

## 3. Dedicated Erasure / Delete Request Flow

### Correct requirement

Create a dedicated request flow for **TheQah-managed** review-linked data and verification metadata.

### Why the current generic support flow is not enough

Generic support tickets do not clearly separate:

- product support
- abuse reports
- privacy rights requests

This becomes risky when a buyer asks for deletion and the system has no structured path to classify or fulfill the request.

### What TheQah can safely promise

TheQah can promise to review and act on:

- deletion of TheQah-local copies where allowed
- anonymization of TheQah-held display identity where appropriate
- removal of TheQah verification association or public marker where appropriate

TheQah should not promise:

- deletion of the original source-platform review on Salla/Zid

### Recommended request types

- Delete my TheQah-linked review data
- Remove TheQah verification association from my review
- Anonymize my displayed reviewer name in TheQah-controlled outputs
- Ask how to request deletion of the original source-platform review

### Recommended workflow states

- `received`
- `identity_check_required`
- `under_review`
- `completed`
- `partially_completed`
- `redirected_to_merchant_or_platform`
- `rejected_with_reason`

### Recommended implementation note

Do not overload `support_tickets`.

Create a dedicated collection or structured subtype such as:

- `data_requests`

with fields like:

- request type
- requester contact
- requested review/store reference
- scope requested
- outcome
- timestamps

## 4. Retention Periods

### Correct requirement

Define retention periods for each category of TheQah-managed data and publish them clearly.

### Why this matters

Without explicit retention windows:

- buyers cannot understand what is kept and for how long
- internal deletion behavior becomes inconsistent
- policy text remains too vague

### Recommended retention model

These are product/legal recommendations, not fixed legal conclusions:

- Public review text in TheQah-controlled local copy: until merchant removal, buyer rights handling, or defined business expiry
- Verification metadata: fixed verification window, for example 12 months
- Activity logs: 90 days, matching current code in `src/backend/server/activity-tracker.ts`
- Admin audit logs: 12 months or other defined compliance window
- Messaging operational logs: 30 to 90 days
- Backups: fixed backup retention, for example 30 days

### Important rule

Retention must be defined per data type, not as one blanket sentence.

## 5. Exact Deletion Behavior

### Correct requirement

Define exactly what deletion means for each data class.

### Why this matters

“Delete my data” is ambiguous unless broken down by system boundary.

### Required split

Deletion behavior must be documented separately for:

1. source-platform review content
2. TheQah local review copy
3. TheQah verification metadata
4. TheQah operational logs
5. TheQah audit logs
6. TheQah backups

### Recommended behavior model

#### Source-platform review

- Controlled by merchant / Salla / Zid
- TheQah may not be able to delete it directly
- Buyer may need to contact the merchant or source platform

#### TheQah local review copy

- Can be deleted, unpublished, or anonymized depending on internal policy
- If source review still exists, TheQah should clearly state that only its own local copy was affected

#### TheQah verification metadata

- Can be removed or detached from public trust markers
- This may remove the badge/certificate association even if the original review still exists elsewhere

#### Operational logs

- Usually not immediately rewritten
- Retained for a short fixed security/operational window

#### Audit logs

- May need limited retention for compliance and fraud/security defense
- Should be minimized and not contain unnecessary PII

#### Backups

- Usually expire on backup rotation
- Not always immediately erasable from all backup copies
- Policy must say that backup deletion follows scheduled expiration

## 6. Policy Text for Consent and Rights

### Correct requirement

Update policy wording so it matches the actual product flow and system boundaries.

### Important wording caution

Be careful with the word `consent`.

If TheQah does not directly obtain buyer consent in a dedicated step, then the policy should not imply a consent UX that does not exist.

Better framing for buyers is:

- informed about verification
- given a privacy notice
- given a data request path

### Policy text must distinguish

- merchant data
- buyer review-linked data
- source-platform review content
- TheQah-managed verification metadata
- TheQah-managed logs

### Policy must also explain

- TheQah is a verification layer
- TheQah may not control original review rendering on Salla/Zid
- buyer requests handled by TheQah apply to TheQah-managed data and trust markers
- deletion of the original platform-native review may require merchant/platform action

## Suggested Buyer-Facing Promise

TheQah should aim for a promise like this:

> TheQah verifies review credibility programmatically using Salla/Zid order signals.  
> TheQah controls its own verification badge, related metadata, and local records, but may not control the original review shown by the merchant platform.  
> Buyers can request deletion or anonymization of TheQah-managed review-linked data through TheQah privacy/support channels.

## Recommended Implementation Order

1. Define retention periods internally
2. Define exact deletion behavior internally
3. Add badge/certificate disclosure text and privacy/help entry point
4. Add a dedicated data request flow for TheQah-managed data
5. Update policy text so it matches the real system boundary

## Open Decisions

- Should TheQah expose a dedicated `/data-request` page or use `/support` with structured request types?
- Should reviewer `displayName` later be masked or kept as-is?
- Should trust-badge removal be available separately from review-local-copy deletion?
- What retention windows should legal/business approve for verification metadata, audit logs, and backups?
