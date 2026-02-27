# System Prompt for AI Agents

You are working on **TheQah** (الثقة), a production SaaS platform for verified customer reviews on Saudi e-commerce stores (Salla & Zid).

## Read First

Before doing ANY work, read `CODEX.md` in the project root. It contains the full architecture, directory map, data model, and conventions.

**When CODEX.md conflicts with actual code, the CODE is authoritative.** CODEX.md is a descriptive guide, not a prescriptive spec. If you notice a discrepancy, follow what the code actually does and note the inconsistency.

## Critical Rules

1. **Next.js Pages Router** — NOT App Router. API routes are `export default function handler(req, res)`. Pages are in `src/pages/`.
2. **Firebase Admin SDK** for ALL server-side Firestore operations (in `src/pages/api/` and `src/backend/`). Never use the client Firebase SDK on the server.
3. **Firebase Client SDK** only in React components/pages (via `src/lib/firebase.ts`).
4. **TypeScript strict mode** — no `any` unless explicitly suppressed with `eslint-disable`.
5. **Import alias** `@/` maps to `src/`.
6. **Arabic comments are intentional** — preserve them.
7. **Layered architecture**: API route → Service (`src/backend/server/services/`) → Repository (`src/backend/server/repositories/`) → Firestore.
8. **All constants** live in `src/config/constants.ts`. Never hardcode magic numbers.
9. **Subscription plans** defined in `src/config/plans.ts` (TRIAL, PAID_MONTHLY, PAID_ANNUAL).
10. **Rate-limit all public endpoints** using utilities in `src/backend/server/rate-limit*.ts`.
11. **Never log PII** (phone numbers, emails, tokens).
12. **Widget** (`public/widgets/theqah-widget.js`) is standalone vanilla JS — no React, no build tools. Minified at build time via `scripts/minify-widgets.js`.

## Key File Locations

| What | Where |
|---|---|
| Salla webhook handler | `src/pages/api/salla/webhook.ts` |
| Zid webhook handler | `src/pages/api/zid/webhook.ts` |
| Review submission API | `src/pages/api/reviews/submit.ts` |
| Core review logic | `src/backend/server/services/review.service.ts` |
| Store logic | `src/backend/server/services/store.service.ts` |
| Auth context | `src/contexts/AuthContext.tsx` |
| Plans config | `src/config/plans.ts` |
| Constants | `src/config/constants.ts` |
| Firestore rules | `firestore.rules` |
| Widget source | `public/widgets/theqah-widget.js` |
| Widget public API | `src/pages/api/public/widget.ts` |
| SMS sending | `src/backend/server/messaging/send-sms.ts` |
| Email sending | `src/backend/server/messaging/email-sendgrid.ts` |
| Domain→store resolver | `src/backend/server/services/domain-resolver.service.ts` |
| Vercel cron config | `vercel.json` |

## Tech Stack

Next.js 15.5 (Pages Router) · TypeScript · Firebase Firestore · Firebase Auth · Vercel · Tailwind CSS 3 · Radix UI · Framer Motion · Recharts · TipTap · SendGrid · OurSMS · OpenAI · Upstash Redis · Vitest · Playwright · k6

## Commands

```bash
npm run dev          # Dev server
npm run build        # Production build (widgets + next)
npm test             # Vitest unit tests
npm run test:e2e     # Playwright E2E
npm run lint         # ESLint
```

## ⚠️ Fragile Areas — Don't Touch Unless Necessary

The following files/systems are **production-critical, tightly coupled, and easy to break**. Modify them ONLY when explicitly asked, and test thoroughly.

### 🔴 1. Salla Webhook Handler — `src/pages/api/salla/webhook.ts`

- **827 lines**, monolithic handler processing ALL Salla events
- Handles: `app.installed`, `app.store.authorize`, `order.created`, `order.updated`, `review.added`, `subscription.*`, and more
- Delegates to `salla-webhook.service.ts` but still has inline logic for store creation, token saving, email sending, and domain mapping
- **Risk:** A single typo can break store registration, order processing, or review collection for ALL merchants
- **Dependencies:** `sallaClient.ts`, `firebaseAdmin.ts`, `salla-webhook.service.ts`, `registration.service.ts`, `send-sms.ts`, `email-sendgrid.ts`, `merchant-welcome.ts`
- **No test coverage** — changes can only be validated via `tools/salla-webhook-tester.js` or production testing

### 🔴 2. Auth Context — `src/contexts/AuthContext.tsx`

- **3-tier fallback store lookup** (alias → email in userinfo → email in store doc)
- Every React page depends on `useAuth()` → breaking this breaks the entire frontend
- Uses client-side Firestore queries that depend on specific composite indexes
- Silently swallows errors (`catch {}`) — bugs hide here
- **Risk:** Changing the lookup order or query fields can lock all merchants out of their dashboards

### 🔴 3. Domain Resolver — `src/backend/server/services/domain-resolver.service.ts`

- **299 lines** of multi-strategy domain resolution (direct lookup → variations → Salla subdomain parsing → storeId fallback)
- Powers the widget API: if this breaks, **all store widgets stop showing reviews**
- Handles edge cases: custom domains, `s.salla.sa` subdomains, `dev.salla.sa` paths, URL encoding for Firestore doc IDs
- Coupled to the `domains` Firestore collection which is populated by the webhook handler
- **Risk:** Changing URL parsing or lookup order can silently break widget display for specific stores

### 🔴 4. Widget — `public/widgets/theqah-widget.js`

- **31KB standalone vanilla JS** injected into 3rd-party Salla store pages
- Runs in unpredictable environments (other store scripts, CSP policies, different browsers)
- Any change requires `npm run build:widgets` to minify → `theqah-widget.min.js`
- **No framework, no type checking, no tests** — pure DOM manipulation
- **Risk:** Breaking this means reviews disappear from ALL merchant storefronts immediately

### 🟠 5. Review Service — `src/backend/server/services/review.service.ts`

- **802 lines, 30 methods** — the core business logic for the entire platform
- `submitReview()` is a 170-line pipeline: token validation → duplicate check → AI moderation → Firestore write → status determination → notification trigger
- Name masking (`maskName`), sanitization, and privacy logic are delicate
- `listWithFilters()` has complex Firestore query building with cursor-based pagination
- **Risk:** Breaking moderation pipeline = spam reviews published. Breaking privacy logic = PII exposure.

### 🟠 6. SMS Sending — `src/backend/server/messaging/send-sms.ts`

- Phone number normalization (`normalizePhone`) handles Saudi/Egyptian formats with specific prefix rules
- OurSMS API integration with retry logic
- Directly affects customer communication — wrong phone format = failed delivery, wrong message = brand damage
- **Risk:** Changing normalization logic breaks SMS delivery to entire customer segments

### 🟠 7. Salla Token Service — `src/backend/server/services/salla-token.service.ts`

- Singleton managing OAuth token refresh for ALL connected stores
- Handles timestamp format ambiguity (seconds vs milliseconds)
- If refresh fails, the store loses API access → no order syncing, no review syncing
- **Risk:** Breaking token refresh = silent failure, stores appear connected but stop receiving data

### 🟠 8. Rate Limiting — `src/backend/server/rate-limit-kv.ts` + `rate-limit-public.ts`

- Dual-layer system: Upstash Redis (production) → in-memory fallback (dev/failure)
- **Two parallel implementations** (`rate-limit-kv.ts` = 284 lines, `rate-limit-public.ts` = 430 lines) with slightly different interfaces
- Protects public widget API and review submission from DDoS
- **Risk:** Breaking rate limiting exposes the app to abuse; over-aggressive limiting blocks legitimate widget requests

### ⚠️ Other Sensitive Areas

| Area | File(s) | Why Fragile |
|---|---|---|
| **Firestore Rules** | `firestore.rules` | Wrong rule = data leak or total lockout |
| **Firestore Indexes** | `firestore.indexes.json` | Missing index = query crashes in production (takes 10+ min to build) |
| **Middleware** | `middleware.ts` | Global rate limiting + CORS — breaking it affects every request |
| **Vercel Cron** | `vercel.json` | Wrong schedule/path = cron jobs silently stop |
| **Plans Config** | `src/config/plans.ts` | Changing plan IDs/limits breaks billing and quota enforcement |
| **Registration Flow** | `registration.service.ts` + webhook handler | Multi-step: Salla install → store doc → alias doc → welcome email — each step depends on the previous |

### ✅ Safe to Modify Freely

| Area | Why Safe |
|---|---|
| Dashboard UI components | `src/components/dashboard/*.tsx` — purely presentational |
| Admin UI components | `src/components/admin/*.tsx` — internal, not customer-facing |
| Blog system | `src/pages/blog/`, `src/pages/api/blog/` — isolated feature |
| Landing page | `src/pages/index.tsx` — static marketing page |
| Public info pages | `faq.tsx`, `terms.tsx`, `privacy-policy.tsx`, `support.tsx` |
| Docs | `docs/*` — documentation only |
| Test tools | `tools/*`, `scripts/*` — development utilities |
| Styling | `src/styles/*`, `tailwind.config.ts` — visual only |
