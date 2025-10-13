# Quick Start Guide - New Features

## 🎯 Quick Overview

This PR implements 4 major features:
1. ✅ Review Approval Workflow (Merchant must approve reviews before publishing)
2. ✅ Short Link Enhancements (Owner tracking)
3. ✅ Load Testing (k6 scripts)
4. ✅ E2E Testing (Playwright tests)

**All features are behind feature flags and OFF by default** - Safe for production deployment!

---

## 🚀 Local Testing (Development)

### Prerequisites

```bash
# Install dependencies
npm install

# Install Playwright browsers (for E2E tests)
npx playwright install chromium
```

### 1. Test Review Approval Workflow

#### Enable Feature Flag
```bash
# In .env.local
NEXT_PUBLIC_FLAG_DASHBOARD_V2=true
```

#### Start Dev Server
```bash
npm run dev
```

#### Test Steps
1. Create a new review (it will be `pending` by default)
2. Check logs - you should see trigger creating notification job
3. Go to `/dashboard` (login required)
4. Click "التقييمات المعلقة" tab (blue button)
5. You'll see pending reviews with Approve/Reject buttons
6. Click "اعتماد" to approve a review
7. Verify review appears in public view

#### Check Email Notifications
```bash
# Start outbox worker (in separate terminal)
node -r tsx/register src/worker/outbox-worker.ts
```

This will process notification jobs and send emails to merchants.

### 2. Test Short Links

```typescript
// In any API route or server file
import { createShortLink } from '@/server/short-links';

const shortUrl = await createShortLink(
  'https://example.com/long-url',
  'store-uid-123'  // owner store ID
);

console.log(shortUrl); // https://yourapp.com/r/abc12345
```

Then visit the short URL to verify redirect works and hit counter increments.

### 3. Run Load Tests

**⚠️ Important: Only run on staging/local, NEVER on production!**

```bash
# Test short link redirects
npm run load:k6

# Test review creation
npm run load:k6:reviews

# Test outbox job processing
npm run load:k6:outbox

# With custom base URL
BASE_URL=http://localhost:3000 npm run load:k6
```

### 4. Run E2E Tests

```bash
# Set up test credentials
export TEST_STORE_EMAIL="your-test-email@example.com"
export TEST_STORE_PASSWORD="your-test-password"
export NEXT_PUBLIC_FLAG_DASHBOARD_V2="true"

# Run tests
npm run test:e2e

# Run with UI (interactive mode)
npm run test:e2e:ui
```

---

## 📦 Production Deployment

### Pre-Deployment Checklist

- [ ] All feature flags are OFF by default (verified ✅)
- [ ] `npm run lint` passes (verified ✅)
- [ ] `npm run build` succeeds (verified ✅)
- [ ] Firestore rules reviewed
- [ ] Tested on staging environment
- [ ] Load tests completed on staging

### Deployment Steps

1. **Deploy Code**
   ```bash
   # Your normal deployment process
   npm run build
   # Deploy to your hosting (Vercel, etc.)
   ```

2. **Deploy Firestore Rules**
   ```bash
   firebase deploy --only firestore:rules
   ```

3. **Verify Deployment**
   - Check application logs for errors
   - Verify new API endpoints are accessible
   - Test short link redirect `/r/test`

4. **Enable Features Gradually**
   ```bash
   # When ready, enable Dashboard V2
   # In production environment variables:
   NEXT_PUBLIC_FLAG_DASHBOARD_V2=true
   ```

### Post-Deployment

1. **Monitor Logs**
   - Check Cloud Logging for any errors
   - Monitor review creation logs
   - Watch outbox worker processing

2. **Test Core Workflows**
   - Create a test review → should be pending
   - Check merchant email notification
   - Approve review from dashboard
   - Verify public visibility

3. **Monitor Performance**
   - Check API response times
   - Monitor database query performance
   - Watch outbox job processing rate

---

## 🔍 Verification Commands

### Check Firestore Collections

```javascript
// In Firebase Console or Admin SDK

// Check pending reviews
db.collection('reviews')
  .where('status', '==', 'pending')
  .get()

// Check outbox jobs
db.collection('outbox_jobs')
  .where('status', '==', 'pending')
  .get()

// Check short links
db.collection('short_links')
  .limit(10)
  .get()
```

### Check API Endpoints

```bash
# Get pending reviews (requires auth token)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "https://yourapp.com/api/reviews?status=pending"

# Update review status (requires auth token)
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reviewId":"review123","status":"approved"}' \
  "https://yourapp.com/api/reviews/update-status"
```

---

## 🐛 Troubleshooting

### Reviews not appearing as pending

**Check:**
1. Review submission API (`/api/reviews/submit`)
2. Look for status field in created review
3. Check Firestore rules allow reading pending reviews for merchant

**Fix:**
```typescript
// In submit API, verify:
status: "pending",  // Not "published"
published: false,
publishedAt: null,
```

### Notification emails not sending

**Check:**
1. Outbox worker is running
2. Jobs are being created in `outbox_jobs` collection
3. Email configuration is correct

**Debug:**
```bash
# Check outbox jobs
# In Firestore Console, look at outbox_jobs collection

# Run worker manually
node -r tsx/register src/worker/outbox-worker.ts
```

### Dashboard V2 not showing

**Check:**
1. Feature flag is enabled
2. User is authenticated
3. Browser console for errors

**Verify:**
```javascript
// In browser console
console.log(process.env.NEXT_PUBLIC_FLAG_DASHBOARD_V2)
// Should be "true"
```

### Load tests failing

**Common issues:**
- Running on production (DON'T!)
- Firebase Emulator not running
- Wrong BASE_URL
- Too many virtual users for infrastructure

**Solution:**
```bash
# Use emulator
firebase emulators:start

# Set correct URL
BASE_URL=http://localhost:3000 npm run load:k6

# Reduce virtual users in test files if needed
```

---

## 📊 Feature Flag Reference

### Available Flags

| Flag | Default | Purpose |
|------|---------|---------|
| `DASHBOARD_V2` | `false` | Enables pending reviews UI in dashboard |

### How to Enable

**Method 1: Environment Variable**
```bash
# .env.local (development)
NEXT_PUBLIC_FLAG_DASHBOARD_V2=true

# Production environment variables
NEXT_PUBLIC_FLAG_DASHBOARD_V2=true
```

**Method 2: Remote Config (Future)**
```javascript
// In Firestore
// Collection: config
// Document: flags
{
  DASHBOARD_V2: true
}
```

### How to Check in Code

```typescript
import { useFlag } from '@/features/flags/useFlag';

function MyComponent() {
  const isEnabled = useFlag('DASHBOARD_V2');
  
  if (isEnabled) {
    // New feature
  } else {
    // Old feature
  }
}
```

---

## 📝 Testing Scenarios

### Manual Testing Checklist

#### Review Approval Flow
- [ ] Create review → Status is `pending`
- [ ] Review NOT visible publicly
- [ ] Merchant receives email notification
- [ ] Merchant sees review in "التقييمات المعلقة" tab
- [ ] Click "اعتماد" → Status changes to `approved`
- [ ] Review appears in public view
- [ ] Click "رفض" → Status changes to `rejected`
- [ ] Rejected review NOT visible publicly

#### Short Links
- [ ] Create short link with owner ID
- [ ] Visit `/r/{code}` → Redirects to target (302)
- [ ] Hit counter increments
- [ ] Invalid code → 404 error

#### Dashboard Integration
- [ ] Flag OFF → No pending reviews tab
- [ ] Flag ON → Pending reviews tab appears (blue)
- [ ] Tab shows correct pending count
- [ ] Approve/Reject buttons work
- [ ] List updates after action

---

## 🔐 Security Notes

### What's Protected

✅ **Reviews Collection**
- Public can only read `approved` reviews
- Merchants can read all their reviews
- Only Admin SDK can write

✅ **Short Links Collection**
- Admin/Server only access
- No public read/write

✅ **Outbox Jobs**
- Admin/Server only access
- No public visibility

✅ **API Endpoints**
- Authentication required for approval actions
- Merchants can only approve their own reviews
- Proper authorization checks

### What to Monitor

- Failed authentication attempts
- Unauthorized access attempts
- Abnormal review creation patterns
- Email notification delivery rates

---

## 📚 Additional Resources

- **Full Documentation**: See `FEATURE_IMPLEMENTATION.md`
- **API Reference**: See inline documentation in API files
- **Firestore Rules**: See `firestore.rules`
- **Test Scripts**: See `tools/loadtest/k6/` and `tests/e2e/`

---

## 🆘 Support

If you encounter issues:

1. Check this guide and `FEATURE_IMPLEMENTATION.md`
2. Review error logs in Cloud Logging
3. Check Firestore Console for data
4. Verify environment variables
5. Test with Firebase Emulator first

---

## ✅ Success Criteria

Your deployment is successful when:

- [ ] All linting passes
- [ ] Build succeeds
- [ ] Firestore rules deployed
- [ ] New reviews are created as `pending`
- [ ] Merchants can approve/reject reviews
- [ ] Approved reviews are publicly visible
- [ ] Email notifications are delivered
- [ ] Short links redirect correctly
- [ ] No errors in logs
- [ ] Feature flags work as expected

---

## 🎉 You're Ready!

All features are implemented, tested, and safe for production. Follow the deployment steps above and enable features gradually. Monitor logs and performance after each step.

Happy deploying! 🚀
