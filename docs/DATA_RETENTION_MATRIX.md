# Data Retention Matrix

This matrix is based on the **current codebase**, not on target architecture.

It answers one question:

`What can be deleted, what cannot be deleted, and what is only safe to delete under conditions?`

## Decision Levels

- `KEEP`: do not delete if you want the current product to keep working normally.
- `CONDITIONAL`: delete only if you accept feature loss, or after replacing the dependency.
- `DELETE / REVOKE`: should be removed after disconnect, expiry, or operational use.

## Matrix

| Data / Collection | Decision | Why | What breaks if removed | Main code refs |
|---|---|---|---|---|
| `stores/{storeUid}` real store docs | `KEEP` | Canonical store lifecycle record for Salla/Zid, subscriptions, plan state, connection state, dashboard context | Dashboard store resolution, widget/store resolution, public profile, subscription alerts, reconnect continuity | `src/backend/server/services/store.service.ts`, `src/backend/server/repositories/store.repository.ts`, `src/backend/server/services/verification.service.ts`, `src/pages/api/cron/subscription-alerts.ts` |
| `stores/{ownerUid}` alias docs | `CONDITIONAL` | Used by alias-based auth/store resolution | Login/dashboard store resolution for users that still depend on alias lookup | `src/contexts/AuthContext.tsx`, `src/utils/verifyStore.ts`, `src/backend/server/services/store.service.ts`, `src/pages/api/_if_needed/auth/exchange-onboarding.ts` |
| `stores.subscription.*` and `stores.plan.*` | `KEEP` | Used to determine active plan and verification eligibility | Subscription alerts, badge gating, billing/plan continuity | `src/backend/server/repositories/store.repository.ts`, `src/backend/server/services/verification.service.ts`, `src/pages/api/admin/subscription.ts`, `src/pages/api/cron/subscription-alerts.ts` |
| `domains/{key}` | `KEEP` | Domain-to-store resolution for widget/public flows | Widget/store lookup from merchant domains breaks | `src/backend/server/repositories/domain.repository.ts`, `src/backend/server/services/domain-resolver.service.ts`, `src/backend/server/services/verification.service.ts` |
| stale `domains/{key}` variations | `CONDITIONAL` | Some variants are redundant, but active domain resolution still depends on them | Specific merchants may stop resolving on older/custom/variant domains | `src/backend/server/services/domain-resolver.service.ts`, `src/backend/server/repositories/domain.repository.ts` |
| `reviews/{reviewId}` | `KEEP` | Core product data for public trust surfaces and merchant dashboard | Public reviews, verified checks, moderation, store profile, analytics value | `src/backend/server/repositories/review.repository.ts`, `src/backend/server/services/review.service.ts`, `src/backend/server/services/verification.service.ts`, `src/pages/api/public/store-profile.ts` |
| `orders/{orderId}` | `CONDITIONAL` | Needed for dashboard order history and order-based analytics; not the core public review surface | Orders tab, order export, dashboard totals/history | `src/backend/server/services/order.service.ts`, `src/pages/api/orders/index.ts`, `src/pages/api/orders/export.ts`, `src/backend/server/services/store.service.ts` |
| `owners/{storeUid}` owner/store linkage | `KEEP` | Used in Salla-side owner/account linkage and alerting | Salla token refresh path and owner-based notification flows can break | `src/backend/server/repositories/owner.repository.ts`, `src/backend/server/services/salla-token.service.ts`, `src/lib/sallaClient.ts`, `src/pages/api/cron/subscription-alerts.ts` |
| `owners/{storeUid}.oauth.*` live Salla OAuth tokens | `DELETE / REVOKE` on disconnect | Sensitive credentials, not archival business history | Salla API access/refresh stops for disconnected stores, which is the intended outcome | `src/backend/server/repositories/owner.repository.ts`, `src/backend/server/services/salla-token.service.ts`, `src/lib/sallaClient.ts` |
| `zid_tokens/{zidStoreId}` | `DELETE / REVOKE` on disconnect | Live Zid credential store, should not be archived as long-term history | Zid sync/refresh stops for disconnected stores, which is the intended outcome | `src/backend/server/services/zid-token.service.ts`, `src/pages/api/zid/disconnect.ts`, `src/pages/api/zid/refresh.ts` |
| `zid_tokens/{uid}` compatibility copies | `DELETE` | Backward-compat duplicate copy, not the primary key used by refresh logic | Little to no intended product impact if canonical Zid store-id token remains | `src/pages/api/zid/callback.ts`, `src/backend/server/services/zid-token.service.ts`, `src/pages/api/zid/disconnect.ts` |
| `salla_tokens/{uid}` | `CONDITIONAL` | Legacy/fallback/debug source, not the primary Salla refresh store | Fallback connection-status/debug paths may become less informative until cleaned up | `src/backend/server/services/store.service.ts`, `src/backend/server/services/support.service.ts`, `src/pages/api/_if_needed/salla/subscribe.ts` |
| `optouts_sms/{phone}` | `KEEP` | Prevents sending messages to opted-out recipients | You may re-message numbers that previously opted out | `src/backend/server/services/sms.service.ts`, `src/backend/server/messaging/phone.ts` |
| `setup_tokens/{token}` | `DELETE / REVOKE` after use or expiry | Temporary onboarding/setup artifact | Only old setup-password links stop working, which is expected after expiry/use | `src/backend/server/services/registration.service.ts`, `src/backend/server/services/auth.service.ts` |
| `onboarding_tokens/{token}` | `DELETE / REVOKE` after use or expiry | Temporary onboarding artifact | Old onboarding exchange links stop working, which is expected after expiry/use | `src/pages/api/_if_needed/auth/exchange-onboarding.ts` |
| `zid_states/{state}` | `DELETE / REVOKE` after callback/expiry | Temporary OAuth state store | Old/expired Zid OAuth handshakes stop resolving, which is expected | `src/backend/server/zid/state.ts` |
| `processed_events/{key}` | `CONDITIONAL` with short retention | Idempotency protection, not business history | Very old duplicate-event protection is lost; live flows still work if recent windows are kept | `src/backend/server/idempotency.ts`, `src/pages/api/salla/webhook.ts` |
| `ratelimits/{key}` | `DELETE / REVOKE` on schedule | Temporary abuse-control counters | Only current counters reset; no core feature loss | `src/backend/server/rate-limit.ts` |
| `user_activity/{id}` | `CONDITIONAL` with retention | Optional analytics/behavior tracking; code already documents a 90-day policy | Historical usage analytics and activity dashboards lose old data | `src/backend/server/activity-tracker.ts`, `src/pages/api/activity/track.ts` |
| `widget_impressions/{id}` | `CONDITIONAL` with retention | Optional widget analytics | Historical impression analytics disappear | `src/pages/api/public/widget.ts`, `src/pages/api/public/pixel.ts` |
| `sync_logs/{id}` and `syncLogs/{id}` | `CONDITIONAL` with retention | Operational monitoring only | Admin/ops sync-history views lose old data | `src/backend/server/services/monitoring.service.ts`, `src/pages/api/cron/sync-zid-reviews.ts`, `src/pages/api/admin/monitor-sync.ts` |
| `webhook_logs/{id}`, `webhook_errors/{id}`, `webhook_firebase/{id}`, `order_state_changes/{id}` | `CONDITIONAL` with retention | Diagnostics/troubleshooting only | Old webhook troubleshooting evidence disappears | `src/backend/server/services/zid-webhook.service.ts`, `src/pages/api/salla/webhook.ts`, `src/backend/server/utils/salla-webhook.logger.ts` |
| `metrics/{id}`, `_metrics/current`, `_health/ping` | `CONDITIONAL` with retention | Monitoring and health telemetry only | Monitoring dashboards lose old/current telemetry | `src/backend/server/services/support.service.ts`, `src/backend/server/services/maintenance.service.ts`, `src/backend/server/services/monitoring.service.ts` |
| `admin_audit_logs/{id}` | `CONDITIONAL` with retention | Internal admin moderation/audit trail | You lose admin action history and auditability | `src/backend/server/repositories/audit-log.repository.ts`, `src/backend/server/services/admin.service.ts`, `src/backend/server/services/maintenance.service.ts` |
| `review_reports/{id}` | `CONDITIONAL` with retention | Needed only if abuse-reporting/admin handling remains active | Admin reports queue/history disappears | `src/backend/server/services/support.service.ts`, `src/backend/server/services/maintenance.service.ts`, `src/components/admin/AdminReports.tsx` |
| `support_tickets/{id}` | `CONDITIONAL` with retention | Support history only | Old support context disappears | `src/backend/server/services/support.service.ts` |
| `feedback/{id}` | `CONDITIONAL` with retention | Product feedback history only | Old feedback/admin triage context disappears | `src/backend/server/services/support.service.ts`, `src/backend/server/services/admin.service.ts` |
| `sms_logs/{id}` | `CONDITIONAL` with retention | Operational delivery history only | SMS troubleshooting history disappears | `src/backend/server/services/sms.service.ts` |
| `registration_logs/{id}` | `CONDITIONAL` with retention | Operational onboarding trail only | Old onboarding troubleshooting history disappears | `src/backend/server/services/registration.service.ts`, `src/backend/server/services/zid-webhook.service.ts` |
| `salla_app_events/{id}` and `zid_events/{id}` | `CONDITIONAL` with retention | Operational/provider event history only | Old event troubleshooting disappears | `src/backend/server/services/salla-webhook.service.ts` |

## Recommended Minimum Keep Set

If the goal is:

`Let the merchant return later and resume with the least friction`

then keep at minimum:

- `stores/{storeUid}`
- `stores.subscription.*`
- `stores.plan.*`
- `domains/{key}`
- `reviews/{reviewId}`
- owner/store linkage in `owners/{storeUid}`
- `orders/{orderId}` only if dashboard history matters
- `optouts_sms/{phone}`

## Recommended Delete / Revoke Set

If the goal is:

`Reduce risk without breaking reactivation`

then delete or revoke first:

- live Zid tokens on disconnect
- live Salla OAuth tokens on disconnect
- setup/onboarding temporary tokens after use
- temporary OAuth state docs
- ratelimit counters on schedule
- old idempotency docs on schedule
- old operational logs on schedule

## Practical Rule

Do **not** delete:

- merchant identity and store state
- review history
- domain mappings that still resolve live stores
- subscription/plan history you still use

Do delete or time-limit:

- credentials
- temporary onboarding/state docs
- operational logs
- monitoring counters
- duplicate-event/idempotency/rate-limit artifacts

## Notes

- This matrix is based on **current code dependencies**, not legal advice.
- Some items marked `CONDITIONAL` can move to `DELETE` after code cleanup removes the remaining read paths.
- The clearest legacy candidate is `salla_tokens/{uid}`, but it still has fallback/debug readers today.
