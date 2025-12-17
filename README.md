# TheQah - Customer Reviews & Loyalty Platform

**TheQah** is a comprehensive customer reviews and loyalty platform for Salla e-commerce stores. It helps merchants collect verified reviews, send automated review requests, and display beautiful review widgets on their storefronts.

## 🚀 Features

### Core Features
- ✅ **Salla Integration** - OAuth-based connection with Salla stores
- ✅ **Automated Review Requests** - Send SMS/WhatsApp invitations after order delivery
- ✅ **Verified Reviews** - Reviews from confirmed purchases
- ✅ **Review Widgets** - Embeddable widgets (stars display + full reviews)
- ✅ **Smart Widget v3.0** - Adds verification badges directly to Salla product pages
- ✅ **Review Sync** - Bidirectional sync with Salla native reviews
- ✅ **Multi-language Support** - Arabic and English
- ✅ **Subscription Plans** - Free, Pro, Premium with quotas

### Monitoring & Operations
- ✅ **Application Monitoring** - Comprehensive metrics collection system
- ✅ **Real-time Dashboard** - API health, errors, and performance tracking
- ✅ **Dual Cron System** - Vercel (4x daily) + GitHub Actions (1x daily) for reliability
- ✅ **Automated Cleanup** - 30-day metric retention, 60-day log retention
- ✅ **Webhook Tracking** - Monitor Salla webhook events and processing

## 🏗️ Architecture

### Tech Stack
- **Framework:** Next.js 15.5.4 (Pages Router)
- **Language:** TypeScript
- **Database:** Firebase Firestore
- **Authentication:** Firebase Auth + Salla OAuth
- **Deployment:** Vercel (Production)
- **Monitoring:** Custom metrics system with Firestore
- **SMS:** OurSMS integration
- **Email:** SendGrid

### Project Structure
```
theqah/
├── src/
│   ├── pages/              # Next.js pages and API routes
│   │   ├── api/
│   │   │   ├── admin/      # Admin endpoints (monitoring, cleanup)
│   │   │   ├── cron/       # Scheduled jobs (review sync)
│   │   │   ├── salla/      # Salla integration (OAuth, webhooks)
│   │   │   └── reviews/    # Review management APIs
│   │   ├── dashboard/      # Merchant dashboard
│   │   └── *.tsx           # Public pages
│   ├── components/         # React components
│   ├── lib/                # Core libraries (Firebase, Salla, SMS)
│   ├── server/             # Server-side utilities
│   │   ├── monitoring/     # Metrics collection & API monitoring
│   │   └── *.ts            # Auth, notifications, rate limiting
│   └── types/              # TypeScript types
├── public/
│   └── widgets/            # Embeddable widget scripts
├── functions/              # Firebase Cloud Functions (cleanup jobs)
├── tests/                  # E2E tests with Playwright
└── tools/                  # Development and testing tools
```

## 🚀 Getting Started

### Prerequisites
- Node.js 20+ (currently using v22.14.0)
- Firebase project (Firestore + Auth)
- Salla partner app credentials
- Vercel account (for deployment)

### Environment Variables
Create `.env.local` with the following:

```bash
# Firebase
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
FIREBASE_ADMIN_PROJECT_ID=
FIREBASE_ADMIN_PRIVATE_KEY=
FIREBASE_ADMIN_CLIENT_EMAIL=

# Salla OAuth
NEXT_PUBLIC_SALLA_CLIENT_ID=
SALLA_CLIENT_SECRET=
NEXT_PUBLIC_SALLA_REDIRECT_URI=

# Webhook Security
SALLA_WEBHOOK_SECRET=
CRON_SECRET=
ADMIN_SECRET=

# SMS Provider
OURSMS_APP_KEY=
OURSMS_USERNAME=
OURSMS_SENDER_ID=

# Email
SENDGRID_API_KEY=
SENDGRID_FROM_EMAIL=

# App URLs
NEXT_PUBLIC_APP_URL=https://theqah.vercel.app
NEXT_PUBLIC_WIDGET_URL=https://theqah.vercel.app/widgets
```

### Installation

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

### Firebase Functions Setup

```bash
cd functions
npm install
npm run build

# Deploy functions (requires Blaze plan)
firebase deploy --only functions
```

### Deploy Firestore Indexes

```bash
firebase deploy --only firestore:indexes
```

Wait 10 minutes for indexes to build.

## 📊 Monitoring System

### Monitoring Endpoints
- `GET /api/admin/monitor-app` - Application-wide metrics dashboard
- `GET /api/admin/monitor-realtime` - Real-time activity (last 5 minutes)
- `GET /api/admin/monitor-sync` - Salla reviews sync health monitoring
- `POST /api/admin/cleanup-metrics` - Manual cleanup trigger

**Authentication:** Add header `Authorization: Bearer {ADMIN_SECRET}`

### Metrics Collected
- API request/response times
- Error rates by endpoint
- Database operation counts
- Webhook processing success/failure
- Sync job results and quota usage

### Cleanup Jobs
- **Metrics:** Deleted after 30 days (runs daily at 2 AM UTC)
- **Sync Logs:** Deleted after 60 days (runs daily at 2:30 AM UTC)

## 🔄 Scheduled Jobs

### Vercel Cron (Every 6 hours)
```
0 */6 * * * - Review sync for all active stores
```

### GitHub Actions (Daily at 3 AM UTC - Backup)
```yaml
- Runs review sync
- Checks system health
- Reports status
```

## 🧪 Testing

### Manual Testing Tools
```bash
# Test Salla webhooks
npm run test:webhook

# Test review sending
npm run test:review

# Test easy registration mode
npm run test:easy-mode
```

### E2E Tests (Playwright)
```bash
# Run tests
npm run test:e2e

# Run with UI
npm run test:e2e:ui
```

### Load Testing (k6)
```bash
# Test redirects
npm run load:k6

# Test review creation
npm run load:k6:reviews
```

## 📚 Documentation

- **[QUICK_START.md](QUICK_START.md)** - Quick setup guide
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Detailed system architecture
- **[APPLICATION_MONITORING.md](APPLICATION_MONITORING.md)** - Monitoring system guide
- **[MONITORING_SETUP.md](MONITORING_SETUP.md)** - Dual cron setup
- **[MONITORING_PROBLEMS.md](MONITORING_PROBLEMS.md)** - Known issues and solutions
- **[CLEANUP_DEPLOYMENT.md](CLEANUP_DEPLOYMENT.md)** - Cleanup jobs deployment
- **[CLEANUP_TEMPORARY_SOLUTION.md](CLEANUP_TEMPORARY_SOLUTION.md)** - Temporary cleanup with external cron
- **[ISSUES_TRACKER.md](ISSUES_TRACKER.md)** - Complete issue list (47 items)
- **[SALLA_REVIEWS_INTEGRATION.md](SALLA_REVIEWS_INTEGRATION.md)** - Salla integration guide
- **[SMART_WIDGET_IMPLEMENTATION.md](SMART_WIDGET_IMPLEMENTATION.md)** - Widget v3.0 documentation

## 🔐 Security

- **API Authentication:** Bearer token with ADMIN_SECRET
- **Webhook Verification:** Salla signature validation
- **Rate Limiting:** Implemented on public endpoints
- **Data Sanitization:** PII redaction in logs (TODO: C3)
- **Environment Separation:** Dev/prod metrics isolation (TODO: H2)

## 🚢 Deployment

### Vercel Deployment
```bash
# Connect to Vercel
vercel

# Deploy to production
vercel --prod

# Or push to main branch (auto-deploy)
git push origin main
```

### Firebase Deployment
```bash
# Deploy indexes
firebase deploy --only firestore:indexes

# Deploy rules
firebase deploy --only firestore:rules

# Deploy functions (requires billing)
firebase deploy --only functions
```

## 📈 Performance

- **Build Time:** ~60s
- **Cold Start:** <3s
- **API Response:** <500ms (p95)
- **Widget Load:** <1s
- **Monitoring Overhead:** 2-5% per request

## 🐛 Known Issues

See [ISSUES_TRACKER.md](ISSUES_TRACKER.md) for complete list (47 issues):
- 🔴 **8 Critical** - Must fix before production
- 🟠 **12 High Priority** - Fix within 1 week
- 🟡 **15 Medium Priority** - Fix within 1 month
- 🟢 **12 Low Priority** - Nice to have

## 📝 License

Proprietary - All rights reserved

## 👥 Team

**Developer:** TheQah Team  
**Contact:** farwqahmd118@gmail.com  
**Firebase Project:** theqah-d3ee0  
**Vercel:** theqah.vercel.app

---

**Last Updated:** December 17, 2025  
**Version:** 1.0.0 (Production-ready with monitoring)
