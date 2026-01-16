# Comprehensive Application Monitoring System

## 🎯 Overview

Complete monitoring solution for TheQah application covering:
- **API Performance**: Response times, error rates, throughput
- **Database Usage**: Firestore reads/writes, quota tracking
- **Webhooks**: Success rates, event tracking
- **Business Metrics**: Reviews, stores, subscriptions
- **Real-time Monitoring**: Live activity stream
- **Alerting**: Automatic detection of issues

---

## 📊 Monitoring Endpoints

### 1. **Application Dashboard**
**Endpoint:** `GET /api/admin/monitor-app?period=24h|7d|30d`

**Purpose:** Comprehensive application health and performance metrics

**Usage:**
```bash
# Last 24 hours (default)
curl -H "Authorization: Bearer $ADMIN_SECRET" \
  https://theqah.com/api/admin/monitor-app

# Last 7 days
curl -H "Authorization: Bearer $ADMIN_SECRET" \
  https://theqah.com/api/admin/monitor-app?period=7d
```

**Response:**
```json
{
  "ok": true,
  "period": "24h",
  "summary": {
    "totalApiCalls": 15420,
    "totalErrors": 45,
    "errorRate": "0.29%",
    "totalWebhooks": 320,
    "totalAlerts": 2
  },
  "performance": {
    "avgResponseTime": 245,
    "p50ResponseTime": 180,
    "p95ResponseTime": 850,
    "p99ResponseTime": 1420,
    "slowestEndpoint": "/api/reviews/send"
  },
  "endpoints": [
    {
      "endpoint": "/api/salla/webhook",
      "count": 3200,
      "avgDuration": 340,
      "errors": 12,
      "p95Duration": 890
    }
  ],
  "errors": {
    "total": 45,
    "byEndpoint": [
      { "endpoint": "/api/salla/sync-reviews", "count": 15 }
    ],
    "recent": [...]
  },
  "database": {
    "totalReads": 12500,
    "totalWrites": 4300,
    "estimatedDailyReads": 12500,
    "estimatedDailyWrites": 4300,
    "quotaStatus": {
      "reads": "25%",
      "writes": "22%"
    }
  },
  "webhooks": {
    "total": 320,
    "byEvent": [
      {
        "event": "order.created",
        "total": 180,
        "failures": 3,
        "successRate": "98.3%"
      }
    ]
  },
  "stores": {
    "total": 50,
    "byPlan": {
      "professional": 30,
      "starter": 15,
      "free": 5
    },
    "activeToday": 42
  },
  "reviews": {
    "total": 850,
    "verified": 680,
    "verificationRate": "80.0%"
  },
  "alerts": [
    {
      "type": "slow_endpoint",
      "severity": "warning",
      "message": "/api/reviews/send: Avg 2340ms",
      "endpoint": "/api/reviews/send",
      "avgDuration": 2340
    }
  ]
}
```

---

### 2. **Real-time Monitoring**
**Endpoint:** `GET /api/admin/monitor-realtime`

**Purpose:** Last 5 minutes of live activity

**Usage:**
```bash
curl -H "Authorization: Bearer $ADMIN_SECRET" \
  https://theqah.com/api/admin/monitor-realtime
```

**Response:**
```json
{
  "ok": true,
  "timestamp": 1702371600000,
  "window": "5 minutes",
  "stats": {
    "totalRequests": 45,
    "totalErrors": 1,
    "errorRate": "2.22%",
    "activeEndpoints": 8,
    "activeStores": 12,
    "avgRequestsPerMinute": 9
  },
  "activity": [
    {
      "timestamp": 1702371590000,
      "type": "api_call",
      "severity": "info",
      "endpoint": "/api/reviews/send",
      "method": "POST",
      "statusCode": 200,
      "duration": 345,
      "storeUid": "salla:12345"
    }
  ],
  "health": {
    "status": "✅ Healthy",
    "requestsPerMinute": [8, 9, 10, 8, 9],
    "errorsPerMinute": 0.2
  }
}
```

---

### 3. **Sync Monitoring** (Existing)
**Endpoint:** `GET /api/admin/monitor-sync`

**Purpose:** Salla reviews sync health and alerts

---

### 4. **Sync Statistics** (Existing)
**Endpoint:** `GET /api/admin/sync-stats`

**Purpose:** Detailed sync statistics per store

---

## 🔧 Implementation Guide

### Step 1: Wrap API Endpoints with Monitoring

**Before:**
```typescript
// src/pages/api/your-endpoint.ts
export default async function handler(req, res) {
  // Your code
}
```

**After:**
```typescript
// src/pages/api/your-endpoint.ts
import { withMonitoring } from "@/server/monitoring/api-monitor";

async function handler(req, res) {
  // Your code (no changes needed)
}

export default withMonitoring(handler);
```

**Benefits:**
- ✅ Automatic performance tracking
- ✅ Error logging
- ✅ Response time measurement
- ✅ No code changes to existing logic

---

### Step 2: Track Custom Events

```typescript
import { metrics, trackDatabase, trackError } from "@/server/monitoring/metrics";

// Track database operations
await trackDatabase({
  operation: "read",
  collection: "reviews",
  count: 50,
  duration: 120,
  storeUid: "salla:12345"
});

// Track custom business events
await metrics.track({
  type: "review_created",
  severity: "info",
  storeUid: "salla:12345",
  metadata: { 
    reviewId: "review_123",
    source: "salla_native",
    verified: true
  }
});

// Track errors
await trackError({
  endpoint: "/api/reviews/send",
  error: "Failed to send email",
  storeUid: "salla:12345",
  metadata: { emailProvider: "smtp" }
});
```

---

### Step 3: Track Webhooks

```typescript
import { trackWebhook } from "@/server/monitoring/metrics";

// In webhook handler
const startTime = Date.now();
try {
  // Process webhook
  await trackWebhook({
    event: "order.created",
    storeUid: "salla:12345",
    success: true,
    duration: Date.now() - startTime
  });
} catch (error) {
  await trackWebhook({
    event: "order.created",
    storeUid: "salla:12345",
    success: false,
    error: error.message,
    duration: Date.now() - startTime
  });
}
```

---

## 📈 Metrics Collection

### Automatic Metrics (via `withMonitoring`)
- **api_call**: Every API request
  - endpoint, method, statusCode, duration
  - userId, storeUid (auto-extracted)
  - error (if any)

### Manual Metrics (via `metrics.track()`)
- **database_read**: Firestore read operations
- **database_write**: Firestore write operations
- **webhook_received**: Webhook events
- **email_sent**: Email delivery
- **sms_sent**: SMS delivery
- **review_created**: New review
- **sync_completed**: Sync operations
- **payment_event**: Payment/subscription events
- **auth_event**: Login/logout/register

---

## 🚨 Alert Types

### Performance Alerts
- **slow_endpoint**: Avg response > 2s
- **high_p95**: P95 response > 5s

### Error Alerts
- **high_error_rate**: >5% of requests failing
- **critical_errors**: Any critical severity errors

### Quota Alerts
- **high_db_reads**: >90% of daily read quota
- **high_db_writes**: >90% of daily write quota

### Sync Alerts (from monitor-sync)
- **stale_sync**: No sync in 12+ hours
- **never_synced**: Store connected but never synced
- **zero_reviews**: No reviews after sync attempts

---

## 📊 Firestore Collections

### `metrics` Collection
```typescript
{
  type: "api_call" | "database_read" | "webhook_received" | ...,
  severity: "info" | "warning" | "error" | "critical",
  endpoint: "/api/reviews/send",
  method: "POST",
  statusCode: 200,
  duration: 345,
  userId: "user_123",
  storeUid: "salla:12345",
  error: "Error message",
  metadata: { /* custom data */ },
  timestamp: 1702371600000
}
```

**Retention:** 30 days (implement cleanup job)

### `syncLogs` Collection
```typescript
{
  timestamp: 1702371600000,
  source: "vercel-cron" | "github-actions",
  totalStores: 50,
  totalSynced: 150,
  totalErrors: 2,
  quotaUsage: { reads: 300, writes: 152 },
  results: [/* first 10 results */]
}
```

---

## 🔍 Querying Metrics

### Via Firestore Console
```javascript
// All errors in last hour
db.collection("metrics")
  .where("severity", "==", "error")
  .where("timestamp", ">", Date.now() - 3600000)
  .orderBy("timestamp", "desc")
  .limit(100)

// Slow API calls (>2s)
db.collection("metrics")
  .where("type", "==", "api_call")
  .where("duration", ">", 2000)
  .orderBy("duration", "desc")

// Store-specific metrics
db.collection("metrics")
  .where("storeUid", "==", "salla:12345")
  .where("timestamp", ">", startDate)
  .orderBy("timestamp", "desc")
```

---

## 🎛️ Dashboard Setup

### Option 1: Simple HTML Dashboard
```html
<!DOCTYPE html>
<html>
<head>
  <title>TheQah Monitoring</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>
  <h1>Application Health</h1>
  <div id="stats"></div>
  <canvas id="performanceChart"></canvas>
  
  <script>
    const ADMIN_SECRET = 'YOUR_SECRET';
    
    async function loadMetrics() {
      const res = await fetch('/api/admin/monitor-app', {
        headers: { 'Authorization': `Bearer ${ADMIN_SECRET}` }
      });
      const data = await res.json();
      
      document.getElementById('stats').innerHTML = `
        <p>Total Requests: ${data.summary.totalApiCalls}</p>
        <p>Error Rate: ${data.summary.errorRate}</p>
        <p>Avg Response: ${data.performance.avgResponseTime}ms</p>
      `;
      
      // Chart performance
      new Chart(document.getElementById('performanceChart'), {
        type: 'line',
        data: {
          labels: data.endpoints.map(e => e.endpoint),
          datasets: [{
            label: 'Avg Duration (ms)',
            data: data.endpoints.map(e => e.avgDuration)
          }]
        }
      });
    }
    
    setInterval(loadMetrics, 30000); // Refresh every 30s
    loadMetrics();
  </script>
</body>
</html>
```

### Option 2: Next.js Admin Page
Create `src/pages/admin/monitoring.tsx` with React components

### Option 3: External Tools
- **Grafana**: Import metrics via API
- **Datadog**: Forward metrics
- **New Relic**: Custom integration

---

## 📅 Maintenance Tasks

### Daily
- ✅ Check `/api/admin/monitor-app` for alerts
- ✅ Review error rate trends
- ✅ Verify quota usage

### Weekly
- ✅ Analyze slow endpoints
- ✅ Review webhook success rates
- ✅ Check store activity patterns

### Monthly
- ✅ Cleanup old metrics (>30 days)
- ✅ Capacity planning based on trends
- ✅ Performance optimization review

### Cleanup Job (Firebase Function)
```typescript
// functions/src/cleanup-metrics.ts
export const cleanupOldMetrics = functions.pubsub
  .schedule('0 2 * * *') // Daily at 2 AM
  .onRun(async () => {
    const db = admin.firestore();
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    
    const oldMetrics = await db.collection("metrics")
      .where("timestamp", "<", thirtyDaysAgo)
      .limit(500)
      .get();
    
    const batch = db.batch();
    oldMetrics.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    
    console.log(`Deleted ${oldMetrics.size} old metrics`);
  });
```

---

## 🚀 Deployment Checklist

- [ ] Deploy Firestore indexes: `firebase deploy --only firestore:indexes`
- [ ] Wait 10 minutes for index build
- [ ] Test monitoring endpoints with ADMIN_SECRET
- [ ] Wrap 5-10 critical API endpoints with `withMonitoring()`
- [ ] Add custom tracking to webhook handler
- [ ] Add custom tracking to review creation
- [ ] Set up daily monitoring check (manual or automated)
- [ ] Create simple dashboard or use API directly
- [ ] Set up metrics cleanup job

---

## 📊 Expected Performance

### Metrics Collection
- **Overhead per request:** <5ms
- **Buffering:** 50 events before Firestore write
- **Cost:** ~0.02 writes per API call (batched)

### Query Performance
- **Dashboard load:** 1-3 seconds (10,000 metrics)
- **Real-time monitor:** <500ms
- **Index optimization:** All queries use composite indexes

### Storage
- **Average metric size:** ~500 bytes
- **Daily metrics (1000 req/day):** ~0.5 MB
- **Monthly storage:** ~15 MB
- **30-day retention:** ~15 MB total

---

## 🎯 Success Metrics

After implementation, you'll have:
- ✅ **Full visibility** into API performance
- ✅ **Automatic error detection** and alerting
- ✅ **Quota monitoring** to prevent overages
- ✅ **Real-time activity** stream
- ✅ **Historical trends** for capacity planning
- ✅ **Business metrics** (reviews, stores, subscriptions)
- ✅ **Webhook reliability** tracking
- ✅ **Performance bottleneck** identification

---

## 🔗 Related Documentation

- [MONITORING_SETUP.md](./MONITORING_SETUP.md) - Sync-specific monitoring
- [FIRESTORE_OPTIMIZATION.md](./FIRESTORE_OPTIMIZATION.md) - Database optimization
- [SALLA_REVIEWS_INTEGRATION.md](./SALLA_REVIEWS_INTEGRATION.md) - Reviews integration

---

**Next Steps:**
1. Deploy indexes and test endpoints
2. Wrap critical endpoints with monitoring
3. Set up daily monitoring routine
4. Create simple dashboard for quick checks
