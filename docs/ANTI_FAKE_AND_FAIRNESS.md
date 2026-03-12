# Anti-Fake Review and Fairness Technical Note

Document status: Internal technical governance note  
Version: 1.0  
Last updated: 2026-03-11  
Scope: Review provenance, verification, moderation, and fairness controls in TheQah

## 1. Purpose

This document explains, in formal technical terms, how TheQah currently establishes review credibility, what signals it uses, what it does not claim to do, and what fairness controls and limitations exist in the current system.

This document is intentionally narrower than a marketing statement. It describes the live implementation and should be used as the internal baseline for audit, review, and future product claims.

## 2. Executive Position

TheQah currently operates as a **verification and trust layer**, not as a standalone universal AI fake-review classifier.

In practical terms:

- TheQah primarily relies on **review provenance and platform-side purchase signals**
- TheQah also runs **content moderation** on selected review-ingestion paths
- TheQah supports **manual administrative review and overrides**
- TheQah does **not** currently claim that a dedicated model independently determines, in all cases, whether a review is human or automated without reliance on platform/order context

This distinction is material and should be preserved in all external descriptions.

## 3. Decision Layers

### 3.1 Platform Provenance

TheQah distinguishes reviews by origin and ingest path, including:

- Salla native review ingestion
- Zid review synchronization
- internal/public review-management flows and admin operations

Source attribution is stored on the review record, for example:

- `source: 'salla_native'`
- `source: 'zid_sync'`

### 3.2 Purchase and Eligibility Signals

TheQah uses source-specific purchase or eligibility signals to determine trust or verification-related fields.

Current examples in code:

- **Salla native reviews**
  - review linked to product and order identifiers
  - duplicate prevention by `orderId + productId`
  - `verified` derived from whether the review/order date is on or after subscription start
- **Zid synchronized reviews**
  - `trustedBuyer` derived from Zid `bought_this_item`
  - `verified` derived from whether review creation time is on or after subscription start when that subscription timestamp is available

### 3.3 Duplicate Prevention and Document Identity

TheQah uses stable review/document identity patterns to reduce duplicate or conflicting records, for example:

- Salla review doc ID composed from merchant, order, and product context
- Zid review doc ID composed from Zid review ID

TheQah also prevents duplicate Salla review ingestion by checking existing review records using order and product linkage before writing a new record.

### 3.4 Content Moderation

TheQah runs a moderation pipeline for risky content. This includes:

- quick rule-based checks
- text moderation through API/prompt hybrid logic
- image moderation when image inputs are available
- manual review state when content is flagged

This moderation layer is designed to assess content safety and quality risk. It is not identical to fraud-proof or bot-proof review-authenticity classification.

### 3.5 Human Oversight

TheQah supports:

- pending review states
- admin approval/rejection/hide flows
- bulk admin review actions
- admin audit logging for review actions

This is the primary control for handling uncertain or borderline cases.

## 4. Signals Currently Used

The following signals are evidenced in the codebase today.

### 4.1 Salla Review Ingestion

Current signals:

- source platform is Salla
- product ID from review payload
- order ID / reference linkage
- order/review timestamp compared against subscription start
- duplicate check by order/product
- moderation result on review text
- optional image moderation when applicable in shared moderation flows

Current outputs:

- `verified`
- `trustedBuyer` currently `false` for native Salla path
- `status`
- `moderation.flags` when content requires review
- `needsSallaId` until Salla review ID backfill completes

Reference:

- [salla-webhook.service.ts](/D:/theqah/src/backend/server/services/salla-webhook.service.ts)

### 4.2 Zid Review Sync

Current signals:

- source platform is Zid
- Zid review ID
- product ID
- Zid `product.bought_this_item`
- review creation timestamp compared against subscription start when available

Current outputs:

- `trustedBuyer`
- `verified`
- `status`
- `isAnonymous`
- `zidReviewId`

Important implementation note:

The current Zid sync path does not itself run the full content moderation routine before persistence in the same way the Salla native webhook path does. This should be understood as a current architectural asymmetry, not as a fairness claim.

Reference:

- [zid-review-sync.service.ts](/D:/theqah/src/backend/server/services/zid-review-sync.service.ts)

### 4.3 Shared Verification Utilities

The codebase also contains shared verification-reason utilities that define review verification reasons such as:

- `subscription_date`
- `manual_verification`
- `auto_verified`
- `salla_native`

Reference:

- [verification-utils.ts](/D:/theqah/src/backend/server/verification-utils.ts)

### 4.4 Shared Moderation Stack

The moderation module combines:

- profanity/rule checks
- API moderation
- prompt-based moderation
- optional image review path

Reference:

- [moderation/index.ts](/D:/theqah/src/backend/server/moderation/index.ts)

## 5. Signals Not Used for Verification Decisions

Based on the current implementation, TheQah does not intentionally use the following as verification-decision features:

- religion
- ethnicity
- nationality
- gender
- age
- disability status
- political belief
- merchant plan tier as a trust score input
- merchant size as a trust score input
- reviewer email or phone as a verification-scoring signal

This does not mean such data never exists elsewhere in the platform for operational reasons. It means those fields are not the stated or evidenced decision inputs for current verification logic.

## 6. System Outputs and Their Meaning

TheQah currently uses several trust-related outputs. These must be distinguished clearly.

| Field / Output | Meaning | Should Not Be Misstated As |
|---|---|---|
| `verified` | Review met current source/platform verification rule | proof that a model independently proved the review is human |
| `trustedBuyer` | Stronger purchase-linked signal from source/platform context | full fraud guarantee |
| `verifiedReason` | Reason label describing why verification was applied | universal authenticity score |
| moderation flags / categories | Content-safety or review-quality concern indicators | definitive bot/fraud classification |
| `status` | Operational publishing state | authenticity score |

## 7. Fairness Principles

TheQah should evaluate the current system according to the following fairness principles.

### 7.1 Rule Consistency

Within each source integration, the same documented rule set should apply to similarly situated reviews. Verification outcomes should be based on source signals and documented business logic, not merchant identity or arbitrary operator preference.

### 7.2 Separation of Concerns

TheQah must keep the following concepts separate in product and documentation:

- purchase/provenance verification
- content moderation
- manual admin review
- fraud/fake-review risk

This separation reduces misleading claims and makes appeals and audits more defensible.

### 7.3 Data Restraint

Trust decisions should use the smallest set of features necessary for the documented purpose. Current work already reduced several raw contact-data paths; future model or rules expansion should preserve that principle.

### 7.4 Human Review Availability

When automated or semi-automated content review is uncertain, TheQah should preserve a manual review path and an auditable action trail.

### 7.5 Auditability

Administrative overrides and moderation decisions should be traceable through audit records so that unusual patterns, false positives, or inconsistent handling can be reviewed later.

## 8. False Positives, False Negatives, and Appeals

### 8.1 False Positives

Possible examples:

- legitimate review flagged by moderation rules
- legitimate historical review not marked as verified due to subscription-date logic
- platform-side source asymmetry causing different trust outputs between Salla and Zid

Current handling:

- Salla native ingestion can move flagged content to `pending_review`
- admins can approve, reject, hide, or update review status
- audit logging exists for admin actions

### 8.2 False Negatives

Possible examples:

- low-quality or synthetic review that still arrives from a trusted platform source
- content that is not flagged by moderation but is still misleading

Current handling:

- platform provenance reduces risk but does not eliminate it
- moderation adds another screening layer
- admin/manual reporting and review flows remain necessary

### 8.3 Merchant Appeal / Review Position

TheQah currently has manual administrative pathways and support/reporting flows, but a single formal merchant appeal policy for flagged or disputed reviews should still be documented more explicitly if required for external audit posture.

## 9. Known Limitations

The current architecture has the following important limitations:

1. TheQah is not yet a standalone end-to-end fake-review classification engine.
2. Verification behavior is partly source-dependent.
3. Zid and Salla paths are not identical in implementation detail.
4. Subscription-date verification is a business rule, not a universal proof of authorship.
5. Content moderation output should not be equated with final fraud determination.
6. Historical reviews and post-subscription reviews may be treated differently by design.

These limitations should be disclosed internally and should constrain external claims.

## 10. Required Governance Review Cadence

The following operating cadence is recommended as the minimum formal governance posture:

- monthly sample review of flagged moderation outcomes
- monthly review of admin overrides and hidden/deleted reviews
- quarterly review of source-specific verification asymmetries
- quarterly review of false-positive and false-negative examples
- quarterly review of public-facing claims versus actual code behavior

If adopted operationally, the outcome of these reviews should be recorded in an internal governance note or compliance log.

## 11. Current Control Maturity

| Area | Current Maturity | Notes |
|---|---|---|
| Platform provenance | Strong | Salla/Zid source and review identity are explicit |
| Purchase-linked signals | Moderate to strong | Good on current source signals, but source asymmetry exists |
| Duplicate prevention | Moderate | Present on Salla path and stable document IDs |
| Content moderation | Moderate | Hybrid moderation exists, but not uniformly embedded in every source path |
| Human review and audit | Moderate | Admin controls and audit logging exist |
| Fairness governance documentation | Newly formalized | This document establishes baseline wording; governance cadence still needs adoption |
| Standalone AI anti-fake classification | Low / not claimed | Not a valid external claim today |

## 12. External Claim Boundaries

Until the system materially changes, TheQah should be comfortable saying:

- reviews are verified using source-platform and purchase-related signals where available
- TheQah applies moderation and operational controls to improve trust and reduce abuse
- TheQah maintains manual oversight and auditability for review-management actions

TheQah should avoid saying, without further system development and validation:

- a proprietary AI model definitively detects all fake reviews
- all trusted reviews are guaranteed to be human-authored
- moderation outcome equals fraud certainty

## 13. Code References

- [salla-webhook.service.ts](/D:/theqah/src/backend/server/services/salla-webhook.service.ts)
- [zid-review-sync.service.ts](/D:/theqah/src/backend/server/services/zid-review-sync.service.ts)
- [verification-utils.ts](/D:/theqah/src/backend/server/verification-utils.ts)
- [moderation/index.ts](/D:/theqah/src/backend/server/moderation/index.ts)
- [review.service.ts](/D:/theqah/src/backend/server/services/review.service.ts)
- [audit-log.repository.ts](/D:/theqah/src/backend/server/repositories/audit-log.repository.ts)
