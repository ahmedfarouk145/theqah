# User Activity Tracking

## Overview

TheQah tracks user activity for analytics and behavior analysis. This helps understand user engagement, feature usage, and improve UX.

## Features

- **Authentication tracking**: Login, logout, signup, password reset
- **Dashboard tracking**: Page views, feature usage
- **Review actions**: Sync, approve, reject, delete
- **Settings changes**: Configuration updates
- **API calls**: Endpoint usage monitoring
- **Admin actions**: Admin dashboard access

## Architecture

**Storage**: Firestore `user_activity` collection  
**Retention**: 90 days (automatic cleanup)  
**Privacy**: GDPR-compliant IP anonymization

## Data Schema

```typescript
{
  userId: string;           // Firebase Auth UID
  storeUid: string;         // Store identifier
  action: ActivityAction;   // Action type
  metadata: object;         // Additional context
  ip: string;               // Anonymized IP
  userAgent: string;        // Browser info
  referrer: string;         // Referrer URL
  timestamp: number;        // Unix timestamp (ms)
}
```

## Tracked Actions

### Authentication
- `auth.login` - User login
- `auth.logout` - User logout
- `auth.signup` - New user registration
- `auth.password_reset` - Password reset request

### Dashboard
- `dashboard.view` - Dashboard page view
- `reviews.view` - Reviews page view
- `settings.view` - Settings page view
- `subscription.view` - Subscription page view

### Reviews
- `reviews.sync` - Review sync triggered
- `reviews.approve` - Review approved
- `reviews.reject` - Review rejected
- `reviews.delete` - Review deleted

### Settings
- `settings.update` - Settings changed
- `widget.install` - Widget installed
- `widget.customize` - Widget customized

### Subscription
- `subscription.upgrade` - Plan upgraded
- `subscription.cancel` - Plan canceled

### Admin
- `admin.access` - Admin dashboard accessed
- `admin.user_view` - User profile viewed
- `admin.store_view` - Store profile viewed

## Usage

### Server-Side Tracking

```typescript
import { trackActivity, trackAuth, trackPageView } from '@/server/activity-tracker';

// Track authentication
await trackAuth({
  userId: user.uid,
  storeUid: 'salla:12345',
  action: 'login',
  req
});

// Track page view
await trackPageView({
  userId: user.uid,
  storeUid: 'salla:12345',
  page: 'dashboard',
  req
});

// Track custom activity
await trackActivity({
  userId: user.uid,
  storeUid: 'salla:12345',
  action: 'reviews.sync',
  metadata: { count: 42 },
  req
});
```

### Client-Side Tracking

```typescript
import { useActivityTracker, usePageViewTracking } from '@/hooks/useActivityTracker';

function MyComponent() {
  const { trackEvent } = useActivityTracker();
  
  // Auto-track page view
  usePageViewTracking('reviews');
  
  // Track custom event
  const handleSync = async () => {
    await trackEvent({
      action: 'reviews.sync',
      metadata: { manual: true }
    });
  };
}
```

## Analytics API

### Get Daily Active Users (DAU)

```bash
GET /api/analytics/activity?action=dau&startDate=2025-12-18
```

Response:
```json
{
  "dau": 142,
  "date": "2025-12-18T00:00:00.000Z"
}
```

### Get Monthly Active Users (MAU)

```bash
GET /api/analytics/activity?action=mau&startDate=2025-12-18
```

Response:
```json
{
  "mau": 1523,
  "date": "2025-12-18T00:00:00.000Z"
}
```

### Get Feature Usage

```bash
GET /api/analytics/activity?action=feature_usage&startDate=2025-11-18&endDate=2025-12-18
```

Response:
```json
{
  "usage": {
    "dashboard.view": 3421,
    "reviews.view": 2134,
    "reviews.sync": 856,
    "settings.view": 432
  },
  "startDate": "2025-11-18",
  "endDate": "2025-12-18"
}
```

### Get User Timeline

```bash
GET /api/analytics/activity?action=user_timeline&userId=abc123
```

Response:
```json
{
  "userId": "abc123",
  "timeline": [
    {
      "action": "dashboard.view",
      "timestamp": 1702857600000,
      "metadata": { "page": "reviews" }
    }
  ]
}
```

### Get Retention Rate

```bash
GET /api/analytics/activity?action=retention&cohortStart=2025-11-01&cohortEnd=2025-11-30&checkDate=2025-12-18
```

Response:
```json
{
  "retentionRate": 42.5,
  "cohortStart": "2025-11-01",
  "cohortEnd": "2025-11-30",
  "checkDate": "2025-12-18"
}
```

## Analytics Queries

### Get Activity Count by Action

```javascript
db.collection('user_activity')
  .where('timestamp', '>=', startTime)
  .where('timestamp', '<=', endTime)
  .get()
  .then(snapshot => {
    const counts = {};
    snapshot.docs.forEach(doc => {
      const action = doc.data().action;
      counts[action] = (counts[action] || 0) + 1;
    });
    return counts;
  });
```

### Get User's Last Activity

```javascript
db.collection('user_activity')
  .where('userId', '==', userId)
  .orderBy('timestamp', 'desc')
  .limit(1)
  .get();
```

### Get Most Active Users

```javascript
// This requires aggregation - use Cloud Functions
const activities = await db.collection('user_activity')
  .where('timestamp', '>=', startTime)
  .get();

const userCounts = {};
activities.docs.forEach(doc => {
  const userId = doc.data().userId;
  userCounts[userId] = (userCounts[userId] || 0) + 1;
});

const topUsers = Object.entries(userCounts)
  .sort(([, a], [, b]) => b - a)
  .slice(0, 10);
```

## Privacy & GDPR Compliance

### IP Anonymization

All IP addresses are anonymized before storage:

- **IPv4**: `192.168.1.100` → `192.168.1.0`
- **IPv6**: `2001:0db8:85a3:0000:0000:8a2e:0370:7334` → `2001:0db8:85a3:0000::`

### Data Retention

Activity logs are automatically deleted after **90 days**. This ensures compliance with data retention policies.

### No PII Storage

Activity logs do not store personally identifiable information:
- No email addresses
- No phone numbers
- No full names
- Only anonymized IPs

## Cleanup Function

A scheduled Cloud Function cleans up old activity logs:

```typescript
// functions/src/cleanup-activity.ts
export const cleanupActivity = functions
  .pubsub
  .schedule('0 4 * * *') // Daily at 4 AM UTC
  .onRun(async () => {
    const { cleanupOldActivity } = await import('./activity-tracker');
    const result = await cleanupOldActivity();
    console.log(`Cleaned up ${result.deleted} old activity logs`);
  });
```

## Admin Dashboard

View activity analytics in the admin dashboard:

```typescript
import UserActivityDashboard from '@/components/admin/UserActivityDashboard';

// In admin page
<UserActivityDashboard />
```

Features:
- DAU/MAU metrics
- Engagement rate (DAU/MAU ratio)
- Top 10 features by usage
- Real-time refresh

## Metrics Integration

Activity tracking integrates with the existing metrics system:

```typescript
// Tracked in both user_activity AND metrics collections
await metrics.track({
  type: 'auth_event',
  severity: 'info',
  userId,
  storeUid,
  metadata: { action, ...metadata }
});
```

This allows:
- Real-time monitoring dashboards
- Alert triggers on unusual activity
- Cross-referencing with other metrics

## Configuration

### Enable/Disable Tracking

```bash
# .env
ENABLE_ACTIVITY_TRACKING=true  # Default: true
```

### Adjust Retention Period

```typescript
// src/server/activity-tracker.ts
const RETENTION_DAYS = 90; // Change as needed
```

## Testing

### Manual Testing

```bash
# Track a login
curl -X POST http://localhost:3000/api/activity/track \
  -H "Authorization: Bearer YOUR_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"auth.login"}'

# Get DAU
curl "http://localhost:3000/api/analytics/activity?action=dau"

# Get feature usage
curl "http://localhost:3000/api/analytics/activity?action=feature_usage&startDate=2025-11-01&endDate=2025-12-18"
```

### Automated Testing

```typescript
// tests/activity-tracking.test.ts
import { trackActivity, getDailyActiveUsers } from '@/server/activity-tracker';

describe('Activity Tracking', () => {
  it('should track user activity', async () => {
    await trackActivity({
      userId: 'test-user',
      storeUid: 'test-store',
      action: 'dashboard.view'
    });
    // Verify in Firestore
  });

  it('should calculate DAU correctly', async () => {
    const dau = await getDailyActiveUsers();
    expect(dau).toBeGreaterThanOrEqual(0);
  });
});
```

## Best Practices

1. **Track sparingly**: Only track meaningful user actions
2. **Don't track PII**: Never store sensitive personal data
3. **Batch queries**: Use date range filters to limit query size
4. **Monitor costs**: Watch Firestore read/write usage
5. **Respect privacy**: Always anonymize IPs and respect user consent
6. **Clean regularly**: Ensure cleanup function runs daily
7. **Alert on anomalies**: Set up alerts for unusual activity patterns

## Troubleshooting

### Issue: Tracking not working

**Check**:
1. `ENABLE_ACTIVITY_TRACKING` environment variable
2. Firestore permissions for `user_activity` collection
3. Network requests in browser DevTools
4. Server logs for tracking errors

### Issue: High Firestore costs

**Solution**:
- Reduce retention period (e.g., 30 days instead of 90)
- Sample activity (track only 10% of events)
- Use Cloud Functions aggregation instead of client queries

### Issue: Slow analytics queries

**Solution**:
- Add composite indexes for common query patterns
- Use batch processing for large date ranges
- Cache results in Redis for frequently accessed data

## Future Enhancements

- **Real-time dashboard**: Live activity feed using Firestore listeners
- **Funnel analysis**: Track user journeys through key flows
- **Cohort analysis**: Track retention by signup date/source
- **A/B testing**: Track feature variant usage
- **Heatmaps**: Visual representation of UI interactions
- **Session replay**: Record user sessions for UX analysis

## Support

For issues or questions about activity tracking:
- Check Firestore `user_activity` collection
- Review metrics dashboard for tracking errors
- Contact team lead for data access requests
