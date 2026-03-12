# Records of Processing Activities (RoPA)

Document status: Internal governance register  
Version: 1.0  
Last updated: 2026-03-11  
Scope: TheQah production platform for verified reviews on Salla and Zid

## 1. Purpose

This document records the principal personal-data processing activities currently implemented in TheQah codebase. It is intended to support internal governance, audit readiness, and future legal review.

This is an engineering-grounded RoPA draft based on the live repository and current runtime behavior. Where a legal basis, cross-border transfer classification, or business owner requires formal confirmation, that requirement is stated explicitly.

## 2. System Summary

TheQah operates as a verification and trust layer for merchant review experiences. The platform:

- connects merchants to Salla and Zid
- ingests selected order and review signals
- determines verification-related fields for reviews
- exposes public verification surfaces through widget and public APIs
- stores store, review, operational, and audit records needed to operate the service

TheQah does not process payment-card secrets or card security codes.

## 3. Data Subject Categories

- Merchant owners and store administrators
- Merchant stores and connected storefronts
- Buyers/review authors whose reviews are synchronized or displayed through TheQah-managed surfaces
- Platform administrators and moderators
- Support request submitters and abuse/report submitters

## 4. Main Systems and Stores

- Firestore primary collections: `stores`, `reviews`, `orders`, `domains`, `owners`, `admin_audit_logs`, `user_activity`, `metrics`, `review_reports`, `support_tickets`
- Operational short-lived collections: `setup_tokens`, `onboarding_tokens`, `zid_states`, `processed_events`, `idempotency_keys`, `ratelimits`, `sms_logs`, `email_logs`, `registration_logs`, `widget_impressions`
- Public trust surfaces: widget, public review APIs, public store-review page
- External processors/services present in the codebase: Vercel, Firebase/Firestore, Salla, Zid, SendGrid, SMTP/Dmail, OurSMS, OpenAI

## 5. Processing Register

| ID | Processing Activity | Purpose | Data Subjects | Data Categories | Source | Systems / Collections | Recipients / Processors | Retention Position | Technical Safeguards | Business Owner | Technical Owner |
|---|---|---|---|---|---|---|---|---|---|---|---|
| R1 | Merchant onboarding and account setup | Create merchant account, complete setup, enable access to dashboard and service | Merchant owners/admins | store identifier, admin email, store metadata, onboarding/setup token metadata, account linkage | Merchant input, Salla/Zid install flows, Firebase Auth | `stores`, `owners`, `setup_tokens`, `onboarding_tokens` | Firebase, Vercel | Store/account records retained for service continuity and reactivation; setup/onboarding tokens cleaned after expiry/use | Firebase Admin SDK on server, secure session handling, retention cleanup for temporary tokens | Product / Operations (confirm) | Platform Engineering |
| R2 | Salla and Zid integration authorization | Maintain platform connectivity to merchant stores | Merchant owners/admins | store IDs, OAuth/token data, connection metadata, authorization state, integration settings | Salla/Zid authorization flows | `owners`, `zid_tokens`, `zid_states`, store integration fields | Salla, Zid, Firebase, Vercel | Live credentials retained while integration remains active; temporary OAuth state cleaned after expiry; disconnect cleanup still partially deferred by product choice | Server-side token handling, Admin SDK only on server, secure cookies, internal-only token access paths | Product / Operations (confirm) | Platform Engineering |
| R3 | Domain resolution and public widget routing | Resolve merchant domain to store identity and serve correct verification surface | Merchant stores, storefront visitors | store UID, mapped domains, store public identity metadata | Merchant integration setup, webhook/domain sync logic | `domains`, `stores`, public widget APIs | Firebase, Vercel | Domain/store mapping retained while store remains active or archived for continuity | Domain normalization, rate limiting, server-side resolution logic | Product / Operations (confirm) | Platform Engineering |
| R4 | Order-signal ingestion for verification | Persist limited order metadata needed for verification logic, dashboard continuity, and integration reconciliation | Buyers/review authors indirectly, merchants | order reference, order status, payment status, product linkage, store UID, platform, and in Zid currently additional order-summary fields | Salla/Zid webhooks and sync inputs | `orders` | Salla, Zid, Firebase, Vercel | Orders retained for dashboard continuity and service restoration; minimization review still open for Zid fields | Server-side ingestion, internal-only collections, public endpoint separation, retention cleanup for unrelated temp artifacts | Product / Operations (confirm) | Platform Engineering |
| R5 | Review ingestion, verification, and public trust display | Store reviews, determine trust/verification fields, expose public/store review surfaces | Buyers/review authors, merchants, public storefront visitors | review ID, product ID, stars, review text, author display name, source, verification flags, trusted-buyer flags, publication timestamps, limited media/reply data | Salla native review webhooks, Zid review sync, internal moderation/admin actions | `reviews`, public review APIs, widget response paths | Salla, Zid, Firebase, Vercel | Review records retained as core product records and for merchant reactivation continuity unless separately removed by platform/admin processes | Server-side persistence, public response shaping, rate limiting, no raw reviewer contact fields in current Salla/Zid write paths | Product / Operations (confirm) | Platform Engineering |
| R6 | Verification presentation through widget and public pages | Show trust badge/logo/certificate and public store-review experience | Public visitors, merchants, review authors | review IDs, Salla review IDs, store UID, verification booleans, public review content, public display name | Internal review store and public APIs | widget script, `/api/reviews/check-verified`, `/api/public/store-profile`, `/store/[storeUid]/reviews` | Vercel, Firebase | Public display data follows underlying review/store retention position | Public API rate limiting, public-safe response shaping, removal of public `orderId`, review-focused linking by `reviewId` | Product / Operations (confirm) | Platform Engineering |
| R7 | Review moderation and manual review operations | Prevent unsafe/spammy content, hold flagged content for review, allow admin decisions | Buyers/review authors, moderators, merchants | review text, stars, image URLs, moderation flags/categories, review status, moderator notes, admin action history | Review ingestion, moderation services, admin actions | `reviews`, `admin_audit_logs` | OpenAI, Firebase, Vercel | Review status and audit history retained as operational evidence; exact formal retention for audit history should be confirmed by policy | Hybrid moderation pipeline, admin override paths, audit logging, restricted admin functions | Trust / Moderation (confirm) | Platform Engineering |
| R8 | Email and SMS delivery operations | Deliver operational notifications and track delivery outcomes | Merchant owners/admins and other intended recipients | destination identifiers, delivery metadata, message IDs, job IDs, success/failure, aggregate stats | Internal service events and cron jobs | `sms_logs`, `email_logs`, `sms_stats`, `email_stats`, `metrics` | OurSMS, SMTP/Dmail, SendGrid, Firebase, Vercel | `sms_logs` and `email_logs` currently cleaned at 30 days; metrics/log retention varies by collection | Masked logging for recipient fields, retention cleanup cron, secret-based webhook validation for SMS status | Product / Operations (confirm) | Platform Engineering |
| R9 | Monitoring, activity tracking, and auditability | Operate, secure, troubleshoot, and audit platform behavior | Merchants, admins, platform users | anonymized IP, user ID, store UID, action/event metadata, audit actions, status/error telemetry | Application requests, admin actions, service events | `user_activity`, `metrics`, `admin_audit_logs`, other operational logs | Firebase, Vercel | `user_activity` cleaned after 90 days; some operational logs cleaned after 30 or 90 days; formal audit-log retention should be confirmed | Activity tracker avoids direct PII by design, structured logging, retention cleanup, audit repository | Product / Operations (confirm) | Platform Engineering |
| R10 | Support, complaints, and review reporting | Handle support requests, abuse reports, and review complaints | Merchants, review reporters, support submitters | email/name supplied in ticket/report, review identifier, reason text, resolution metadata | Support forms and public reporting flows | `support_tickets`, `review_reports`, `admin_audit_logs` | Firebase, Vercel, internal support/admin users | Retention should be tied to support, complaint, and audit policy; not yet fully formalized in one policy artifact | Admin access controls, audit logging of resolution actions | Support / Operations (confirm) | Platform Engineering |

## 6. Current Retention Position

The following retention windows are implemented directly in code today:

- `setup_tokens`: expiry cleanup plus used-token cleanup after 1 day grace
- `onboarding_tokens`: expiry cleanup plus used-token cleanup after 1 day grace
- `zid_states`: cleanup after 1 hour grace
- `ratelimits`: cleanup after 1 day
- `processed_events`: cleanup after 7 days
- `idempotency_keys`: cleanup after 1 day
- `auth_logs`, `email_logs`, `sms_logs`, `widget_impressions`: cleanup after 30 days
- `registration_logs`: cleanup after 90 days
- `user_activity`: cleanup after 90 days

Reference implementation:

- [constants.ts](/D:/theqah/src/config/constants.ts)
- [maintenance.service.ts](/D:/theqah/src/backend/server/services/maintenance.service.ts)
- [activity-tracker.ts](/D:/theqah/src/backend/server/activity-tracker.ts)

The following categories do not yet have a single formal, fully approved retention schedule in one governance artifact:

- `stores`
- `owners`
- `reviews`
- `orders`
- `admin_audit_logs`
- `support_tickets`
- `review_reports`
- live integration credentials and archived integration history

## 7. Security and Safeguards Summary

Current technical controls evidenced in the repository include:

- server-side Firestore access through Firebase Admin SDK
- public endpoint rate limiting
- secure and `HttpOnly` session-cookie handling
- removal of public `orderId` from public verification API
- masking of recipient identifiers in SMS/email logging paths
- activity logging designed without direct PII storage
- retention cleanup for temporary artifacts and short-lived operational logs
- admin audit logging for moderation and operational actions

Additional deployment and processor-level controls should be documented separately in a security architecture or security controls document.

## 8. Cross-Border Transfer Position

The codebase uses cloud and processor services that may involve regional or cross-border processing depending on deployment and vendor configuration, including but not limited to:

- Vercel
- Firebase / Google Cloud
- SendGrid
- OpenAI
- OurSMS
- Salla / Zid integration endpoints

The exact cross-border transfer position, controller/processor analysis, and any required contractual or policy treatment should be validated by legal/compliance. This document records the technical presence of such processors only.

## 9. Open Governance Actions

- confirm business owner for each activity
- confirm legal basis wording per activity with counsel
- approve formal retention for core long-lived collections
- document secret rotation and disconnect handling for active platform tokens
- create a companion security-controls document for encryption, key management, and deployment posture

## 10. Code References

- [activity-tracker.ts](/D:/theqah/src/backend/server/activity-tracker.ts)
- [audit-log.repository.ts](/D:/theqah/src/backend/server/repositories/audit-log.repository.ts)
- [salla-webhook.service.ts](/D:/theqah/src/backend/server/services/salla-webhook.service.ts)
- [zid-review-sync.service.ts](/D:/theqah/src/backend/server/services/zid-review-sync.service.ts)
- [zid-webhook.service.ts](/D:/theqah/src/backend/server/services/zid-webhook.service.ts)
- [verification.service.ts](/D:/theqah/src/backend/server/services/verification.service.ts)
- [review.service.ts](/D:/theqah/src/backend/server/services/review.service.ts)
- [maintenance.service.ts](/D:/theqah/src/backend/server/services/maintenance.service.ts)
- [privacy-policy.tsx](/D:/theqah/src/pages/privacy-policy.tsx)
