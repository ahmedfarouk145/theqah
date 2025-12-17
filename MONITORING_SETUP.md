# Monitoring & Dual Cron Setup

## 🔄 Dual Cron Architecture

Your system now uses **TWO independent cron schedulers** for redundancy:

### 1. **Vercel Cron** (Primary)
- **Frequency:** Every 6 hours (4x daily)
- **Schedule:** 12 AM, 6 AM, 12 PM, 6 PM UTC
- **Configuration:** `vercel.json`
- **Authentication:** `x-vercel-cron-secret` header
- **Advantage:** Built-in, serverless, no extra cost

### 2. **GitHub Actions** (Backup)
- **Frequency:** Once daily at 3 AM UTC
- **Configuration:** `.github/workflows/sync-salla-reviews.yml`
- **Authentication:** `CRON_SECRET` from GitHub Secrets
- **Advantage:** Independent backup, runs health check
- **Includes:** Post-sync health monitoring

---

## 📊 Monitoring Dashboard

### Access Monitoring Endpoint
```bash
curl -H "Authorization: Bearer YOUR_ADMIN_SECRET" \
  https://theqah.com/api/admin/monitor-sync
```

### Response Structure
```json
{
  "ok": true,
  "summary": {
    "totalStores": 50,
    "healthyStores": 45,
    "warningStores": 3,
    "criticalStores": 2,
    "totalAlerts": 5,
    "highSeverityAlerts": 2
  },
  "alerts": [
    {
      "type": "stale_sync",
      "severity": "high",
      "storeUid": "salla:12345",
      "storeName": "متجر الاختبار",
      "message": "No sync in 25 hours",
      "hoursSinceSync": 25.3
    },
    {
      "type": "quota_warning",
      "severity": "medium",
      "message": "High read quota usage: 48000 / 50,000 daily",
      "percentage": 96
    }
  ],
  "quotaStatus": {
    "estimatedDailyReads": 5300,
    "estimatedDailyWrites": 5100,
    "readPercentage": 11,
    "writePercentage": 26,
    "status": "✅ Healthy"
  }
}
```

---

## 🚨 Alert Types

### Store Health Alerts
- **`stale_sync`**: No sync in 12+ hours
  - **High severity**: >24 hours
  - **Medium severity**: 12-24 hours
  
- **`never_synced`**: Store connected but never synced reviews
  - **High severity**: Indicates OAuth or API issues
  
- **`zero_reviews`**: Multiple sync attempts but no reviews found
  - **Medium severity**: May indicate store has no reviews or API issues

### Quota Alerts
- **`quota_warning`**: Approaching or exceeding Firestore limits
  - **High severity**: >100% of free tier
  - **Medium severity**: 90-100% of free tier
  
  **Free Tier Limits:**
  - Reads: 50,000/day
  - Writes: 20,000/day

---

## 🔧 Setup Instructions

### 1. Configure GitHub Secrets
Go to GitHub → Your Repo → Settings → Secrets and variables → Actions

**Add these secrets:**
```
CRON_SECRET=c9b8f3ac2ed09e1ac487c3482a481e090b63916ddf03008043c0b53af1849635
ADMIN_SECRET=RkTrCoGuHAS3p9x5Kw4V2iX0JcnZYyNO
```

### 2. Deploy Firestore Indexes
```bash
firebase deploy --only firestore:indexes
```

**Wait 5-10 minutes for indexes to build.**

### 3. Test Monitoring
```bash
# Check monitoring works
curl -H "Authorization: Bearer RkTrCoGuHAS3p9x5Kw4V2iX0JcnZYyNO" \
  https://theqah.com/api/admin/monitor-sync

# Should return summary with stores and alerts
```

### 4. Test GitHub Actions
Go to GitHub → Actions → Select "Sync Salla Reviews (Daily Backup)" → Run workflow

**Expected:**
- ✅ Sync completes successfully
- ✅ Health check runs
- ✅ Shows summary and quota status

---

## 📈 Monitoring Best Practices

### Daily Checks (Automated via GitHub Actions)
- ✅ Run at 3 AM UTC (after Vercel sync at 12 AM)
- ✅ Verify all stores synced
- ✅ Check quota usage
- ✅ Alert on critical issues

### Weekly Manual Review
```bash
# Get detailed monitoring report
curl -H "Authorization: Bearer $ADMIN_SECRET" \
  https://theqah.com/api/admin/monitor-sync | jq '.'

# Check sync statistics
curl -H "Authorization: Bearer $ADMIN_SECRET" \
  https://theqah.com/api/admin/sync-stats | jq '.'
```

### Monthly Capacity Planning
1. Review quota usage trends
2. Calculate growth rate
3. Plan for scaling (upgrade to Blaze if needed)

---

## 📊 Sync Logs Storage

All sync operations are logged to Firestore:
```typescript
// Collection: syncLogs
{
  timestamp: 1702371600000,
  source: "vercel-cron" | "github-actions",
  totalStores: 50,
  totalSynced: 150,
  totalErrors: 2,
  quotaUsage: {
    reads: 300,
    writes: 152
  },
  results: [/* first 10 store results */]
}
```

**Query recent logs:**
```bash
# In Firebase Console
db.collection("syncLogs")
  .orderBy("timestamp", "desc")
  .limit(20)
```

---

## 🎯 Health Status Meanings

### Store Status
- **Healthy** 🟢: Synced within last 7 hours
- **Warning** 🟡: 7-12 hours since last sync
- **Critical** 🔴: >12 hours since last sync

### Quota Status
- **✅ Healthy**: <90% of free tier
- **⚠️ Approaching limit**: 90-100% of free tier
- **⚠️ Exceeds free tier**: >100% (upgrade needed)

---

## 🔔 Setting Up Alerts

### Option 1: Email Alerts (Firebase Functions)
```typescript
// functions/src/index.ts
export const monitorSyncHealth = functions.pubsub
  .schedule('0 4 * * *') // Daily at 4 AM
  .onRun(async () => {
    const response = await fetch('https://theqah.com/api/admin/monitor-sync', {
      headers: { Authorization: `Bearer ${ADMIN_SECRET}` }
    });
    const data = await response.json();
    
    if (data.summary.highSeverityAlerts > 0) {
      // Send email alert
      await sendAdminEmail({
        subject: '⚠️ TheQah Sync Health Alert',
        body: JSON.stringify(data.alerts, null, 2)
      });
    }
  });
```

### Option 2: Slack/Discord Webhook
Add to GitHub Actions:
```yaml
- name: Send Slack Notification
  if: failure()
  run: |
    curl -X POST ${{ secrets.SLACK_WEBHOOK_URL }} \
      -H 'Content-Type: application/json' \
      -d '{"text":"⚠️ TheQah sync failed! Check logs."}'
```

### Option 3: Manual Dashboard
Create a simple admin page at `/admin/monitoring` that calls the monitoring endpoint and displays alerts.

---

## 🛠️ Troubleshooting

### GitHub Actions not running?
1. Check if CRON_SECRET is added to GitHub Secrets
2. Verify workflow file is in `.github/workflows/`
3. Check Actions tab for error logs

### Monitoring endpoint returns 401?
1. Verify ADMIN_SECRET matches in Vercel and request
2. Check Authorization header format: `Bearer YOUR_SECRET`

### High quota usage?
1. Reduce Vercel Cron frequency (every 12h instead of 6h)
2. Upgrade to Blaze plan (~$15-20/month)
3. Implement incremental sync (only fetch new reviews)

---

## 📅 Sync Schedule Summary

| Time (UTC) | Source | Type | Purpose |
|------------|--------|------|---------|
| 12:00 AM | Vercel | Auto | Primary sync |
| 03:00 AM | GitHub | Auto | Backup + Health Check |
| 06:00 AM | Vercel | Auto | Primary sync |
| 12:00 PM | Vercel | Auto | Primary sync |
| 06:00 PM | Vercel | Auto | Primary sync |

**Total:** 5 syncs per day
- **Primary (Vercel):** 4x
- **Backup (GitHub):** 1x with monitoring

---

## ✅ Deployment Checklist

- [ ] Add GitHub Secrets (CRON_SECRET, ADMIN_SECRET)
- [ ] Deploy Firestore indexes: `firebase deploy --only firestore:indexes`
- [ ] Wait 10 minutes for index build
- [ ] Test monitoring endpoint
- [ ] Run GitHub Actions manually to verify
- [ ] Commit and push all changes
- [ ] Monitor first 24h of dual cron operation
- [ ] Review sync logs in Firestore

---

**Next:** After deployment, monitor the first day to ensure both cron jobs work correctly and alerts are triggered as expected.
