# SDAIA Compliance Checklist

Last reviewed: 2026-03-11

This checklist reflects the current codebase state after:

- removing the legacy review token/invite subsystem
- removing manual order add/import
- removing customer contact fields from order export
- reducing Salla order/review storage

Related detail:

- see `docs/VERIFICATION_LAYER_PRIVACY_SCOPE.md` for the corrected buyer-rights scope when TheQah controls only the certificate/logo layer and its own stored verification data
- see `docs/ROPA.md` for the formal processing-activities register
- see `docs/ANTI_FAKE_AND_FAIRNESS.md` for the formal technical anti-fake and fairness note
- see `docs/SECURITY_AND_PROCESSOR_POSTURE.md` for the formal encryption, TLS, and processor-transfer posture note
- see `docs/SECRETS_AND_TOKEN_LIFECYCLE.md` for the formal secrets and token lifecycle note
- see `docs/SECRET_GOVERNANCE_IMPLEMENTATION_MATRIX.md` for the concrete remaining controls, ownership, and rollout order
- see `docs/SECRET_OWNER_ASSIGNMENTS.md` for the role-based owner assignment template and named-owner placeholders
- see `docs/SECRET_ROTATION_EVIDENCE_REGISTER.md` for the live secret rotation and review register

Status legend:

- `Done`: already implemented in the current codebase
- `Open`: still needs work
- `Decision`: product/legal decision required before implementation
- `Deferred`: intentionally postponed until the related subsystem is stable

## 1. Data Minimization

Current status: `Partial`

Current code evidence:

- Salla order snapshots are reduced in `src/backend/server/services/salla-webhook.service.ts`
- Salla review `author.email` and `author.mobile` are no longer stored in `src/backend/server/services/salla-webhook.service.ts`
- Manual order add/import has been removed
- Order export no longer includes customer contact fields in `src/pages/api/orders/export.ts`

Checklist:

- [x] Done: remove legacy review token/invite storage
- [x] Done: remove manual order add/import storage paths
- [x] Done: stop exporting customer name/email/phone in order export
- [x] Done: remove `customer.*` from Salla order snapshot writes
- [x] Done: remove `author.email` and `author.mobile` from Salla review writes
- [x] Done: remove `orderId` from public `src/pages/api/reviews/check-verified.ts` response
- [x] Decision: keep reviewer `displayName` for public display and moderation usability
- [x] Done: document reviewer `displayName` as a retained presentation field in policy/docs
- [ ] Open: optionally introduce a masking/public-safe display-name policy later
- [x] Deferred: keep current Zid order snapshot shape for now because the Zid integration is still under development
- [ ] Deferred: revisit `items`, `productIds`, `total`, `currency`, and `reviewChecked` in `src/backend/server/services/zid-webhook.service.ts` after Zid development stabilizes
- [x] Done: align `src/pages/privacy-policy.tsx` with actual stored fields and actual purposes
- [ ] Open: review whether historical `orders` documents still contain legacy `name` / `phone` / `email`

## 2. Consent, Transparency, and Erasure

Current status: `Partial`

Current code evidence:

- Transparency text exists in `public/widgets/theqah-widget.js`
- Privacy policy page exists in `src/pages/privacy-policy.tsx`
- Generic support/reporting flows exist in `src/backend/server/services/support.service.ts`

Checklist:

- [x] Done: show buyer-facing trust/verification wording in the widget
- [ ] Open: add a clear buyer-facing explanation that verification is performed programmatically via Salla/Zid
- [ ] Open: add a visible privacy/help entry point from public review surfaces
- [ ] Open: add a dedicated erasure/delete request flow for review-linked data
- [ ] Open: define retention periods and publish them clearly
- [ ] Open: define the exact deletion behavior for review text, verification metadata, logs, and backups
- [ ] Open: update policy text so “consent” and “rights” language matches the actual product flow

## 3. Records of Processing Activities (RoPA)

Current status: `Partial`

Current code evidence:

- Activity logs exist in `src/backend/server/activity-tracker.ts`
- Admin audit logs exist in `src/backend/server/repositories/audit-log.repository.ts`

Checklist:

- [x] Done: maintain machine-readable activity logging
- [x] Done: maintain admin audit logging
- [x] Done: create a formal RoPA document outside runtime logs
- [x] Done: list each processing activity and its purpose
- [x] Done: list categories of personal data and data subjects
- [x] Done: list recipients/processors and any third parties
- [x] Done: document retention periods per activity
- [x] Done: document security safeguards per activity
- [ ] Open: document cross-border transfer position, if any
- [ ] Open: assign business owner and technical owner for each processing activity

## 4. Security and Encryption

Current status: `Partial`

Current code evidence:

- Secure session cookies exist in `src/pages/api/auth/session.ts`
- Old token/invite/manual-order surfaces were removed, reducing attack surface
- Firestore rules no longer include the removed token/invite collections

Checklist:

- [x] Done: reduce attack surface by removing deprecated verification subsystems
- [x] Done: use secure, `HttpOnly` session cookies
- [x] Done: stop logging raw recipient email addresses in active email/SMS logging paths
- [x] Done: mask phone numbers in `sms_logs` and SMS DLR/status logging paths
- [x] Done: document encryption in transit and at rest in an internal security document
- [x] Done: document current deployment-level TLS posture conservatively
- [ ] Decision: decide whether the trust badge/certificate must be digitally signed or whether UI-only branding is sufficient
- [x] Done: document key rotation / secrets handling baseline for store integrations
- [x] Done: assign named owner and approved rotation cadence for each secret/token class
- [ ] Open: formalize the active Salla token revocation/disconnect model
- [x] Done: create a lightweight rotation evidence register

## 5. Algorithmic Fairness, Anti-Fake, and Technical Documentation

Current status: `Partial`

Current code evidence:

- Provenance checks exist through native Salla/Zid review sources
- Moderation pipeline exists in `src/backend/server/moderation/index.ts`
- Verification reason mapping exists in `src/backend/server/verification-utils.ts`

Checklist:

- [x] Done: separate purchase provenance from general review ingestion in the codebase
- [x] Done: maintain a moderation pipeline for risky content
- [x] Done: write technical documentation explaining the current anti-fake / provenance model
- [x] Done: clearly separate “purchase verification” from “AI content moderation” in documentation
- [x] Done: define false-positive handling baseline in documentation
- [ ] Open: define merchant appeal/review process for flagged reviews
- [x] Done: define bias/fairness review criteria and review cadence baseline in documentation
- [x] Done: document what signals are used, what is not used, and why
- [x] Done: document model/provider dependencies and fallback behavior

## Recommended Next Steps

Priority 1:

- [ ] implement buyer-facing verification explanation on widget/certificate
- [ ] review historical data for legacy order-contact remnants
- [ ] decide formal owner assignment for RoPA rows

Priority 2:

- [ ] add buyer-facing erasure workflow
- [ ] revisit Zid minimization after Zid development is finished
- [ ] document cross-border transfer position
- [ ] confirm processor/account-specific residency and contractual posture
- [ ] confirm processor-to-account mapping and DPA / contract evidence

Priority 3:

- [ ] document security controls and certificate model
- [ ] formalize merchant appeal workflow for flagged or disputed reviews
