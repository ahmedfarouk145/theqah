# Webhook Retry System Documentation

## Overview

The webhook retry system provides automatic retry logic with exponential backoff for failed webhook processing, ensuring no events are lost due to temporary failures.

**Key Features:**
- Automatic retry with exponential backoff
- Dead Letter Queue (DLQ) for permanently failed webhooks
- Manual retry capabilities via admin UI
- Monitoring integration with metrics
- Health checks and alerting
- GDPR-compliant data retention

**Status:** ✅ Implemented (H6)  
**Components:**
- `src/server/queue/webhook-retry.ts` - Core retry logic
- `src/pages/api/webhooks/retry.ts` - Admin API
- `src/pages/api/webhooks/failed.ts` - DLQ listing API
- `src/pages/api/cron/webhook-retry.ts` - Cron processor
- `src/components/admin/FailedWebhooksDashboard.tsx` - Admin UI
- `src/pages/api/salla/webhook.ts` - Integration point

---

## Architecture

### Retry Strategy

**Exponential Backoff Schedule:**
1. **Attempt 1:** 1 minute after failure
2. **Attempt 2:** 5 minutes after attempt 1
3. **Attempt 3:** 15 minutes after attempt 2
4. **Attempt 4:** 1 hour after attempt 3
5. **Attempt 5:** 6 hours after attempt 4

After 5 failed attempts, the webhook is moved to the Dead Letter Queue (DLQ) for manual review.

### Data Flow

```
Webhook Failure
     ↓
Enqueue to Retry Queue (webhook_retry_queue)
     ↓
Cron Job (every minute)
     ↓
Retry Processing (exponential backoff)
     ↓
   Success? ─── Yes ──→ Remove from queue
     ↓
     No
     ↓
Max Attempts? ─── No ──→ Schedule next retry
     ↓
    Yes
     ↓
Move to DLQ (webhook_dead_letter)
     ↓
Admin Review
     ↓
Manual Retry / Resolve / Ignore
```

### Firestore Collections

#### 1. `webhook_retry_queue`

Stores webhooks pending retry.

**Schema:**
```typescript
{
  id: string;                    // Unique retry ID
  event: string;                 // Event type (e.g., "order.updated")
  merchant: string | number;     // Merchant ID
  orderId: string | null;        // Order ID if applicable
  rawBody: string;               // Original webhook payload
  headers: Record<string, string>; // Original headers
  
  // Retry tracking
  attempts: number;              // Current attempt count
  maxAttempts: number;           // Max attempts before DLQ (default: 5)
  nextRetryAt: number;           // Timestamp for next retry
  lastError: string | null;      // Last error message
  lastAttemptAt: number | null;  // Last attempt timestamp
  
  // Metadata
  storeUid: string | null;       // Store identifier
  priority: "high" | "normal" | "low"; // Retry priority
  tags: string[];                // Tags for filtering
  
  // Timestamps
  createdAt: number;             // Entry creation time
  updatedAt: number;             // Last update time
}
```

**Indexes:**
- `nextRetryAt` (ascending) - For cron job queries
- `storeUid` - For store-specific queries
- `priority` - For priority-based processing

#### 2. `webhook_dead_letter`

Stores permanently failed webhooks for manual review.

**Schema:**
```typescript
{
  id: string;                    // DLQ entry ID
  event: string;                 // Event type
  merchant: string | number;     // Merchant ID
  orderId: string | null;        // Order ID if applicable
  rawBody: string;               // Original payload
  headers: Record<string, string>; // Original headers
  
  // Failure details
  totalAttempts: number;         // Total retry attempts
  errors: Array<{                // Error history
    attempt: number;
    timestamp: number;
    error: string;
    stack?: string;
  }>;
  
  // Metadata
  storeUid: string | null;       // Store identifier
  priority: "high" | "normal" | "low";
  tags: string[];
  
  // Timestamps
  failedAt: number;              // When moved to DLQ
  createdAt: number;             // Original failure time
  
  // Manual review
  reviewedAt: number | null;     // When reviewed
  reviewedBy: string | null;     // Admin user ID
  resolution: "retried" | "ignored" | "manual_fix" | null;
  notes: string | null;          // Admin notes
}
```

**Indexes:**
- `failedAt` (descending) - For listing recent failures
- `reviewedAt` - For filtering unreviewed entries
- `storeUid` - For store-specific queries

---

## Usage

### Automatic Retry (Built-in)

Webhook failures are automatically enqueued for retry when they occur in the webhook handler:

```typescript
// Happens automatically in src/pages/api/salla/webhook.ts
try {
  // Webhook processing...
} catch (error) {
  // Auto-enqueued for retry
  await enqueueWebhookRetry({
    event,
    merchant: merchantId,
    orderId,
    rawBody: raw,
    headers: req.headers,
    error,
    storeUid,
    priority: event.includes("order") ? "high" : "normal",
  });
}
```

### Manual Retry via API

**Retry a specific webhook from DLQ:**
```bash
POST /api/webhooks/retry
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "dlqId": "dlq_retry_1234567890_abc123"
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Webhook retry initiated"
}
```

### Resolve DLQ Entry

**Mark as manually fixed:**
```bash
POST /api/webhooks/retry?action=resolve
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "dlqId": "dlq_retry_1234567890_abc123",
  "resolution": "manual_fix",
  "notes": "Fixed data issue in Firestore"
}
```

**Resolution types:**
- `ignored` - Not important, can be ignored
- `manual_fix` - Fixed manually outside system

### List Failed Webhooks

**Get DLQ entries:**
```bash
GET /api/webhooks/failed?limit=50&onlyUnreviewed=true
Authorization: Bearer <admin-token>
```

**Response:**
```json
{
  "ok": true,
  "entries": [
    {
      "id": "dlq_retry_1234567890_abc123",
      "event": "order.updated",
      "orderId": "12345",
      "totalAttempts": 5,
      "failedAt": 1703001234567,
      "errors": [
        {
          "attempt": 5,
          "timestamp": 1703001234567,
          "error": "Timeout connecting to external service"
        }
      ]
    }
  ],
  "hasMore": false
}
```

### Get Queue Status

**Retry queue:**
```bash
GET /api/webhooks/retry?action=status
Authorization: Bearer <admin-token>
```

**Response:**
```json
{
  "ok": true,
  "total": 15,
  "pending": 3,
  "scheduled": 12,
  "byPriority": {
    "high": 5,
    "normal": 8,
    "low": 2
  },
  "oldestEntry": 1703001234567
}
```

**DLQ status:**
```bash
GET /api/webhooks/retry?action=dlq_status
Authorization: Bearer <admin-token>
```

**Response:**
```json
{
  "ok": true,
  "total": 8,
  "unreviewed": 5,
  "reviewed": 3,
  "byResolution": {
    "retried": 2,
    "ignored": 1
  },
  "oldestEntry": 1702995234567
}
```

### Health Check

```bash
GET /api/webhooks/retry?action=health
Authorization: Bearer <admin-token>
```

**Response:**
```json
{
  "ok": true,
  "healthy": true,
  "issues": [],
  "metrics": {
    "retryQueueSize": 15,
    "dlqSize": 8,
    "oldestRetry": 1703001234567,
    "oldestDLQ": 1702995234567
  }
}
```

---

## Admin Dashboard

The admin UI provides a visual interface for managing failed webhooks.

**Location:** `src/components/admin/FailedWebhooksDashboard.tsx`

**Features:**
- Real-time status of retry queue and DLQ
- List of unreviewed failed webhooks
- One-click retry from DLQ
- Mark webhooks as resolved
- View detailed error history
- Priority-based filtering

**Usage in Admin Page:**
```tsx
import FailedWebhooksDashboard from "@/components/admin/FailedWebhooksDashboard";

function AdminPage() {
  return (
    <div>
      <h1>Admin Dashboard</h1>
      <FailedWebhooksDashboard />
    </div>
  );
}
```

---

## Monitoring

### Metrics Tracked

The retry system integrates with the metrics system to track:

1. **webhook_retry_enqueued**
   - Labels: `event`, `storeUid`, `priority`
   - Triggered: When webhook is added to retry queue

2. **webhook_retry_succeeded**
   - Labels: `event`, `storeUid`, `attempts`
   - Triggered: When retry succeeds

3. **webhook_moved_to_dlq**
   - Labels: `event`, `storeUid`, `attempts`
   - Triggered: When webhook moved to DLQ after max attempts

4. **webhook_retry_cron_execution**
   - Labels: `success`, `processed`, `succeeded`, `failed`, `movedToDLQ`
   - Triggered: After each cron execution

5. **webhook_retry_cron_error**
   - Labels: `error`
   - Triggered: When cron job fails

### Query Examples

**Average retry success rate (last 24h):**
```javascript
const succeeded = await db.collection("metrics")
  .where("name", "==", "webhook_retry_succeeded")
  .where("timestamp", ">=", Date.now() - 24*60*60*1000)
  .get();

const movedToDLQ = await db.collection("metrics")
  .where("name", "==", "webhook_moved_to_dlq")
  .where("timestamp", ">=", Date.now() - 24*60*60*1000)
  .get();

const successRate = succeeded.size / (succeeded.size + movedToDLQ.size);
```

**Webhooks by store:**
```javascript
const retries = await db.collection("webhook_retry_queue")
  .where("storeUid", "==", "salla:12345")
  .get();
```

---

## Alerts

### Alert Conditions

**1. High DLQ Size**
- **Condition:** DLQ > 100 unreviewed entries
- **Action:** Notify admin team
- **Query:**
```javascript
const dlqSize = await db.collection("webhook_dead_letter")
  .where("reviewedAt", "==", null)
  .count()
  .get();

if (dlqSize.data().count > 100) {
  sendAlert("High DLQ size detected");
}
```

**2. Old Unreviewed Entries**
- **Condition:** Unreviewed entries > 24 hours old
- **Action:** Escalate to operations team
- **Query:**
```javascript
const oneDayAgo = Date.now() - 24*60*60*1000;
const oldEntries = await db.collection("webhook_dead_letter")
  .where("reviewedAt", "==", null)
  .where("failedAt", "<", oneDayAgo)
  .count()
  .get();

if (oldEntries.data().count > 0) {
  sendAlert("Old unreviewed DLQ entries");
}
```

**3. Retry Queue Backlog**
- **Condition:** Retry queue > 1000 entries
- **Action:** Check system health
- **Query:**
```javascript
const queueSize = await db.collection("webhook_retry_queue")
  .count()
  .get();

if (queueSize.data().count > 1000) {
  sendAlert("Large retry queue backlog");
}
```

---

## Configuration

### Environment Variables

```bash
# Webhook retry configuration
ENABLE_WEBHOOK_RETRY=true           # Enable retry system (default: true)
WEBHOOK_MAX_RETRY_ATTEMPTS=5        # Max retry attempts (default: 5)
ENABLE_WEBHOOK_DLQ=true              # Enable DLQ (default: true)

# Cron authentication
CRON_SECRET=your-secret-key          # Secret for cron endpoint auth
```

### Vercel Cron Setup

The retry processor runs every minute via Vercel Cron:

**vercel.json:**
```json
{
  "crons": [
    {
      "path": "/api/cron/webhook-retry",
      "schedule": "* * * * *"
    }
  ]
}
```

**Cron schedule format:**
```
* * * * *
│ │ │ │ │
│ │ │ │ └─ Day of week (0-7, 0 or 7 is Sunday)
│ │ │ └─── Month (1-12)
│ │ └───── Day of month (1-31)
│ └─────── Hour (0-23)
└───────── Minute (0-59)
```

**Examples:**
- `* * * * *` - Every minute
- `*/5 * * * *` - Every 5 minutes
- `0 * * * *` - Every hour

---

## Troubleshooting

### Problem: Webhooks stuck in retry queue

**Symptoms:**
- Retry queue size keeps growing
- Old entries not being processed

**Diagnosis:**
```bash
# Check queue status
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "https://your-app.vercel.app/api/webhooks/retry?action=status"

# Check oldest entry
# If oldestEntry is > 24 hours, there's a problem
```

**Solutions:**
1. Check cron job is running (Vercel Dashboard → Cron)
2. Verify CRON_SECRET is set correctly
3. Check cron endpoint logs for errors
4. Manually trigger cron: `GET /api/cron/webhook-retry`

### Problem: High DLQ size

**Symptoms:**
- Many webhooks failing permanently
- DLQ size > 100

**Diagnosis:**
```bash
# List failed webhooks
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "https://your-app.vercel.app/api/webhooks/failed?limit=10"

# Check error patterns
# Look for common error messages in the errors array
```

**Solutions:**
1. Identify common failure patterns
2. Fix underlying issues (network, API limits, data issues)
3. Manually retry webhooks after fix
4. Mark irrelevant failures as ignored

### Problem: Retry attempts not working

**Symptoms:**
- Webhooks moved to DLQ immediately
- No retry attempts logged

**Diagnosis:**
```javascript
// Check if retry is enabled
console.log(process.env.ENABLE_WEBHOOK_RETRY);

// Check webhook handler integration
// Verify enqueueWebhookRetry is called in catch block
```

**Solutions:**
1. Verify `ENABLE_WEBHOOK_RETRY=true` in environment
2. Check webhook.ts has retry integration
3. Review error logs for enqueue failures

### Problem: Manual retry not working

**Symptoms:**
- Retry button doesn't work
- No webhook reprocessing

**Diagnosis:**
```bash
# Test retry API
curl -X POST https://your-app.vercel.app/api/webhooks/retry \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"dlqId": "dlq_xxx"}'
```

**Solutions:**
1. Verify admin authentication
2. Check DLQ ID is correct
3. Review API endpoint logs
4. Ensure webhook handler can be re-invoked

---

## Cleanup

### Automatic Cleanup

The system should periodically clean up old resolved DLQ entries:

```typescript
import { cleanupOldDLQEntries } from "@/server/queue/webhook-retry";

// Clean up entries older than 90 days
const result = await cleanupOldDLQEntries(90);
console.log(`Deleted ${result.deleted} old DLQ entries`);
```

**Recommended schedule:** Monthly via cron

**vercel.json:**
```json
{
  "crons": [
    {
      "path": "/api/cron/cleanup-dlq",
      "schedule": "0 0 1 * *"
    }
  ]
}
```

### Manual Cleanup

**Delete specific DLQ entry:**
```typescript
const db = dbAdmin();
await db.collection("webhook_dead_letter").doc(dlqId).delete();
```

**Bulk delete resolved entries:**
```typescript
const resolved = await db.collection("webhook_dead_letter")
  .where("reviewedAt", "!=", null)
  .limit(500)
  .get();

const batch = db.batch();
resolved.docs.forEach(doc => batch.delete(doc.ref));
await batch.commit();
```

---

## Best Practices

### 1. Monitor DLQ Regularly

Check the admin dashboard daily to review failed webhooks. Set up alerts for:
- DLQ size > 50
- Unreviewed entries > 24h old

### 2. Investigate Patterns

Look for common failure patterns:
- Specific event types failing
- Specific stores having issues
- Time-based patterns (load issues)

### 3. Prioritize Critical Events

Order-related webhooks are automatically set to `high` priority. Consider adjusting for other critical events.

### 4. Document Resolutions

When resolving DLQ entries, always add notes explaining what was done:
```typescript
await resolveDLQEntry(dlqId, userId, "manual_fix", 
  "Customer already contacted, review added manually via API"
);
```

### 5. Test Retry Logic

Periodically test the retry system:
1. Temporarily break a dependency (e.g., external API)
2. Send test webhook
3. Verify it enters retry queue
4. Fix dependency
5. Verify webhook processes successfully

### 6. Capacity Planning

Monitor retry queue size trends:
- Average queue size
- Peak queue size
- Processing rate (webhooks/minute)

Adjust cron frequency if needed.

---

## Security

### Authentication

All retry management endpoints require admin authentication:

```typescript
const session = await verifyAdminSession(req);
if (!session) {
  return res.status(401).json({ error: "Unauthorized" });
}
```

### Data Privacy

- Webhook payloads stored in plain text (already processed)
- No additional PII beyond webhook data
- DLQ entries should be cleaned up after resolution
- Consider encrypting sensitive fields if needed

### Access Control

Only admin users can:
- View DLQ entries
- Manually retry webhooks
- Resolve DLQ entries
- Access retry system status

---

## Performance

### Cron Job Performance

**Target:** Process 50 webhooks per minute
**Actual:** ~20-30 webhooks per minute (varies by complexity)

**Optimization tips:**
- Batch processing (current: 50 per cron run)
- Parallel processing for independent webhooks
- Adjust cron frequency for high load

### Database Queries

**Indexed queries:**
- `nextRetryAt` for pending retries (fast)
- `failedAt` for DLQ listing (fast)
- `reviewedAt` for unreviewed filter (fast)

**Non-indexed queries to avoid:**
- Full collection scans
- Complex array filters
- Cross-collection joins

### Memory Usage

**Typical memory per webhook:**
- Raw body: ~2-5 KB
- Headers: ~1 KB
- Metadata: ~1 KB
- **Total:** ~4-7 KB per entry

**Maximum queue sizes:**
- Retry queue: 1000 entries (~7 MB)
- DLQ: 500 entries (~3.5 MB)

---

## Future Enhancements

### Planned Features

1. **Priority Queues**
   - Separate processing for high/normal/low priority
   - Faster retry for critical events

2. **Batch Retry**
   - Retry multiple webhooks at once
   - Bulk resolution operations

3. **Advanced Filtering**
   - Filter by date range
   - Filter by error type
   - Search by order ID or store

4. **Retry Analytics**
   - Success rate trends
   - Common failure reasons
   - Store-level reliability metrics

5. **Webhook Simulation**
   - Test webhook processing with historical data
   - Dry-run mode for retries

6. **Notification System**
   - Email alerts for DLQ issues
   - Slack integration for critical failures
   - Webhook status dashboard

---

## Support

### Common Questions

**Q: Why are some webhooks never retried?**  
A: Check if `ENABLE_WEBHOOK_RETRY=true` and verify cron job is running.

**Q: How do I know if a webhook was retried?**  
A: Check the `attempts` field in retry queue or `totalAttempts` in DLQ.

**Q: Can I change the retry schedule?**  
A: Yes, modify `DEFAULT_CONFIG.backoffSchedule` in `webhook-retry.ts`.

**Q: What happens if cron job fails?**  
A: Webhooks remain in queue and will be processed on next successful run.

**Q: How do I prevent specific webhooks from retrying?**  
A: Currently not supported. Consider adding webhook type filtering in future.

### Getting Help

1. Check application logs for error details
2. Review DLQ entries for patterns
3. Test retry manually via API
4. Contact development team with DLQ ID and error details

---

## Changelog

### Version 1.0.0 (H6 Implementation)
- ✅ Exponential backoff retry logic
- ✅ Dead Letter Queue (DLQ)
- ✅ Manual retry via API
- ✅ Admin dashboard UI
- ✅ Monitoring integration
- ✅ Health checks
- ✅ Cron job processor
- ✅ Automatic webhook handler integration

### Future Versions
- Priority queue implementation
- Batch operations
- Advanced analytics
- Notification system
