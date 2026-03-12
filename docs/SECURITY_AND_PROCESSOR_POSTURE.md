# Security, Encryption, and Processor Transfer Posture

Document status: Internal security and compliance note  
Version: 1.0  
Last updated: 2026-03-11  
Scope: TheQah application stack, data transport, storage posture, and third-party processor inventory

## 1. Purpose

This document provides a formal, conservative statement of the current security and processor posture of TheQah, based on:

- the live codebase
- the currently configured application architecture
- official documentation from identified infrastructure and processor vendors

This document is intended to support internal compliance review, policy drafting, and future audit preparation. It is not a substitute for legal advice, a DPA review, or a cloud configuration audit.

## 2. Governing Principle

TheQah should make only those security and data-transfer claims that are supported by one or more of the following:

- direct code evidence
- confirmed deployment configuration
- official vendor documentation
- executed contractual documentation

Any statement not yet supported by one of those sources should be treated as **unverified** and described as requiring confirmation.

## 3. Current Technical Architecture

Based on the codebase, TheQah currently depends on the following principal service categories:

- application hosting and edge delivery: Vercel
- primary data platform: Firebase / Firestore / Google Cloud
- merchant platform processors: Salla and Zid
- messaging providers: OurSMS, SMTP/Dmail, and optionally SendGrid
- AI moderation / model provider: OpenAI

These processors may handle personal or operational data depending on the activity being performed.

## 4. Encryption in Transit

### 4.1 Application Delivery and Browser Traffic

TheQah is deployed on Vercel and serves public pages and APIs over HTTPS. Vercel documents support for TLS 1.2 and TLS 1.3.

What can be stated with confidence:

- public application traffic is expected to be delivered over HTTPS
- Vercel supports TLS 1.2 and TLS 1.3
- certificate handling for Vercel-managed delivery is automated by the platform

What should **not** be stated without further evidence:

- “TLS 1.3 only”
- “all custom-domain traffic is restricted to a single TLS version”

Source:

- [Vercel Encryption and TLS](https://vercel.com/docs/cdn-security/encryption)

### 4.2 Application-to-Google/Firebase Traffic

Firestore/Google Cloud communications are covered by Google Cloud’s transport encryption posture. Google documents that client requests to Google Cloud services over HTTPS/HTTP2/HTTP3 are secured with TLS.

What can be stated with confidence:

- communications with Google Cloud services over HTTPS are protected with TLS

Source:

- [Google Cloud Encryption in Transit](https://docs.cloud.google.com/docs/security/encryption-in-transit)

### 4.3 Application-to-SMS Provider Traffic

The current SMS sender uses `https://api.oursms.com` in code, which means traffic from TheQah application runtime to the SMS provider is sent over HTTPS.

What can be stated with confidence:

- application-to-provider SMS API calls use encrypted transport via HTTPS

What requires confirmation:

- provider-side regional routing
- provider data residency
- provider-specific TLS configuration details beyond standard HTTPS use

Code reference:

- [send-sms.ts](/D:/theqah/src/backend/server/messaging/send-sms.ts)

### 4.4 Application-to-Email Provider Traffic

Two email paths exist in the codebase:

- **SMTP/Dmail** path using port `465` with `secure: true`
- **SendGrid API** path over HTTPS

What can be stated with confidence:

- the SMTP/Dmail path is configured for SMTPS from TheQah to the provider
- the SendGrid API path uses HTTPS

What requires confirmation:

- recipient-side enforced TLS for email delivery
- whether SMTP opportunistic TLS or mandatory TLS is in effect for all downstream hops

Code references:

- [email-dmail.ts](/D:/theqah/src/backend/server/messaging/email-dmail.ts)
- [email-sendgrid.ts](/D:/theqah/src/backend/server/messaging/email-sendgrid.ts)

Source:

- [SendGrid TLS glossary](https://www.twilio.com/docs/sendgrid/glossary/tls)

### 4.5 Application-to-OpenAI Traffic

OpenAI documents encryption in transit between the customer and OpenAI, and between OpenAI and its service providers.

What can be stated with confidence:

- OpenAI documents encryption at rest and in transit for customer content

Source:

- [OpenAI Security and Privacy](https://openai.com/security-and-privacy/)

## 5. Encryption at Rest

### 5.1 Vercel

Vercel documents encryption at rest and in transit for platform data, including sensitive information such as access tokens and secrets. Vercel also documents encrypted certificate/key storage and encrypted backups.

What can be stated with confidence:

- Vercel documents encryption at rest for platform data
- Vercel documents encrypted backups retained for a limited period

Source:

- [Vercel Security](https://vercel.com/security)
- [Vercel Encryption and TLS](https://vercel.com/docs/cdn-security/encryption)

### 5.2 Firebase / Firestore / Google Cloud

Google documents default encryption at rest for customer content stored on Google Cloud using AES-256 at the storage layer. Firestore also supports CMEK, but the current repository does not evidence that CMEK is enabled for this deployment.

What can be stated with confidence:

- Firestore/Google Cloud data at rest is encrypted by default by the provider

What should **not** be stated without confirmation:

- “TheQah uses CMEK for Firestore”
- “TheQah uses customer-managed encryption keys for all stored data”

Sources:

- [Google Default Encryption at Rest](https://docs.cloud.google.com/docs/security/encryption/default-encryption)
- [Firestore CMEK](https://firebase.google.com/docs/firestore/cmek)

### 5.3 OpenAI

OpenAI documents encryption at rest for customer content.

Source:

- [OpenAI Security and Privacy](https://openai.com/security-and-privacy/)

## 6. Secrets, Tokens, and Sensitive Operational Material

TheQah codebase uses secrets and tokenized access for:

- Salla OAuth access and refresh tokens
- Zid tokens and authorization state
- SMTP credentials
- SendGrid API key
- OurSMS API credentials
- OpenAI API key
- cron secrets and webhook shared secrets

Current code-evidenced posture:

- active credentials are handled server-side
- secure session cookies are used for authenticated sessions
- public `orderId` exposure has been removed from the widget verification flow
- raw messaging recipient identifiers are masked in operational logs
- temporary artifacts and short-lived operational logs are cleaned by scheduled retention logic

Open posture items still requiring formalization:

- documented key-rotation cadence
- formal disconnect token revocation playbook for all integrations
- explicit environment-secrets ownership and access policy

Related document:

- [SECRETS_AND_TOKEN_LIFECYCLE.md](/D:/theqah/docs/SECRETS_AND_TOKEN_LIFECYCLE.md)

## 7. Processor Inventory

| Processor / Service | Role in TheQah | Data Potentially Processed | Confirmed by Code | Residency / Transfer Position |
|---|---|---|---|---|
| Vercel | hosting, edge delivery, serverless execution | public requests, application responses, logs, secrets, deployment metadata | Yes | cross-region/global posture likely; exact residency to be confirmed from account configuration |
| Firebase / Google Cloud | primary application database and cloud infrastructure | store data, reviews, orders, logs, metrics, settings, support and audit records | Yes | multi-region/global posture possible; exact database region must be confirmed from project settings |
| Salla | merchant platform integration | merchant store identifiers, orders, reviews, integration data | Yes | third-party platform processor; exact residency/transfer position not established here |
| Zid | merchant platform integration | merchant store identifiers, orders, reviews, integration data | Yes | third-party platform processor; exact residency/transfer position not established here |
| OurSMS | SMS delivery processor | destination phone identifiers, delivery metadata, message delivery events | Yes | provider privacy policy explicitly allows possible transfer outside local jurisdiction |
| SMTP/Dmail | email delivery path | destination email, message content, delivery metadata | Yes | residency and transfer posture require confirmation |
| SendGrid | optional / alternate email delivery path | destination email, message content, delivery metadata | Yes | international processor likely; exact account-level data residency not established here |
| OpenAI | moderation/model provider | review text, possibly image URLs or related moderation inputs depending on flow | Yes | global processor posture possible; exact regional routing depends on service configuration |

## 8. Cross-Border Transfer Position

### 8.1 Conservative Current Position

The safest current internal position is:

- cross-border processing is **possible**
- not all processors can currently be described as Saudi-hosted or Saudi-only
- transfer posture should be treated as **mixed / requires confirmation by processor and contract**

This is the prudent position because the stack includes cloud and API vendors that are typically multi-region or international by default.

### 8.2 Evidence Supporting a Conservative Position

- Vercel operates a global edge/network platform
- Google Cloud/Firebase can operate in regional or multi-regional environments depending on configuration
- OpenAI documents processing with service providers
- OurSMS privacy policy states that personal data may be transferred outside the customer’s jurisdiction

Source:

- [OurSMS Privacy Policy](https://oursms.com/en/privacy/)

### 8.3 Claims That Should Not Be Made Without Confirmation

TheQah should not presently claim:

- “all data remains داخل المملكة العربية السعودية”
- “all processors are Saudi-resident”
- “no cross-border transfer occurs”
- “all subprocessors are contractually localized to KSA”

## 9. Current Claims TheQah Can Make Safely

Subject to legal review, the following statements are defensible based on the current codebase and cited vendor documentation:

- TheQah uses encrypted transport with its core web and API infrastructure.
- TheQah relies on providers that document encryption in transit and/or at rest for core platform services.
- TheQah stores application data on provider infrastructure that documents encryption at rest by default.
- TheQah has implemented masking for recipient identifiers in active SMS and email logging paths.
- TheQah uses scheduled retention cleanup for several temporary and short-lived operational data classes.
- TheQah maintains an internal processor inventory and should assess cross-border implications on a per-processor basis.

## 10. Claims TheQah Should Avoid Without Further Confirmation

- “TLS 1.3 only” across the entire stack
- “customer-managed encryption keys are enabled”
- “all processors operate only in Saudi Arabia”
- “all outbound email is enforced with end-to-end TLS”
- “badge/certificate integrity is cryptographically signed”

## 11. Required Follow-Up Actions

- confirm actual Firebase/Firestore region and architecture
- confirm Vercel project/account security configuration relevant to regional posture
- confirm Dmail hosting/residency and any applicable DPA/security commitments
- confirm whether SendGrid is active in production or only fallback/legacy
- document token revocation/rotation and disconnect handling in a separate secrets-and-integrations note
- decide whether badge/certificate integrity requires a cryptographic signature model

## 12. Code Evidence

- [auth/session.ts](/D:/theqah/src/pages/api/auth/session.ts)
- [send-sms.ts](/D:/theqah/src/backend/server/messaging/send-sms.ts)
- [sms.service.ts](/D:/theqah/src/backend/server/services/sms.service.ts)
- [email-dmail.ts](/D:/theqah/src/backend/server/messaging/email-dmail.ts)
- [email-sendgrid.ts](/D:/theqah/src/backend/server/messaging/email-sendgrid.ts)
- [maintenance.service.ts](/D:/theqah/src/backend/server/services/maintenance.service.ts)
- [constants.ts](/D:/theqah/src/config/constants.ts)

## 13. External References

- [Vercel Encryption and TLS](https://vercel.com/docs/cdn-security/encryption)
- [Vercel Security](https://vercel.com/security)
- [Google Cloud Encryption in Transit](https://docs.cloud.google.com/docs/security/encryption-in-transit)
- [Google Default Encryption at Rest](https://docs.cloud.google.com/docs/security/encryption/default-encryption)
- [Firestore CMEK](https://firebase.google.com/docs/firestore/cmek)
- [OpenAI Security and Privacy](https://openai.com/security-and-privacy/)
- [Twilio SendGrid TLS](https://www.twilio.com/docs/sendgrid/glossary/tls)
- [OurSMS Privacy Policy](https://oursms.com/en/privacy/)
- [Dmail](https://dmail.sa/)
