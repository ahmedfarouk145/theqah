# 🔒 Backup & Disaster Recovery Strategy

## Overview

TheQah implements a comprehensive backup strategy for all critical Firestore collections with automated daily backups, retention policies, and disaster recovery procedures.

---

## 📊 What Gets Backed Up

### Critical Collections (Daily Backups)
- ✅ **stores** - Store configurations and settings
- ✅ **reviews** - All customer reviews  
- ✅ **metrics** - Application metrics (last 30 days)
- ✅ **syncLogs** - Synchronization logs
- ✅ **review_tokens** - Review invitation tokens
- ✅ **review_invites** - Invitation records
- ✅ **owners** - OAuth tokens and store ownership
- ✅ **domains** - Domain to store mappings
- ✅ **subscriptions** - Subscription data

---

## ⏰ Backup Schedule

### Automated Daily Backup
- **Time:** 3:00 AM UTC (off-peak hours)
- **Frequency:** Every day
- **Retention:** 30 days
- **Storage:** Firebase Cloud Storage (`theqah-backups` bucket)

### Backup Cleanup
- **Automatic deletion** of backups older than 30 days
- Runs after each backup completes
- Keeps storage costs manageable

---

## 📁 Backup Structure

```
backups/
├── 2025-12-17-1734393600000/
│   ├── stores.json
│   ├── reviews.json
│   ├── metrics.json
│   ├── syncLogs.json
│   ├── review_tokens.json
│   ├── review_invites.json
│   ├── owners.json
│   ├── domains.json
│   ├── subscriptions.json
│   └── metadata.json
├── 2025-12-16-1734307200000/
│   └── ...
└── 2025-12-15-1734220800000/
    └── ...
```

### Backup File Format (JSON)
```json
{
  "collection": "reviews",
  "timestamp": 1734393600000,
  "date": "2025-12-17",
  "documentCount": 15432,
  "documents": [
    {
      "id": "review_123",
      "data": { ... },
      "path": "reviews/review_123"
    }
  ]
}
```

---

## 🚨 Monitoring & Alerts

### Success Tracking
- ✅ Backup completion logged to `metrics` collection
- ✅ Document counts and backup size recorded
- ✅ Duration tracked for performance monitoring

### Failure Alerts
- 🚨 **Critical alerts** sent to admin on backup failure
- 🚨 Errors logged to `backup_errors` collection
- 🚨 Alert includes: error message, stack trace, partial progress

### Monitoring Dashboard
Check backup status at: `/api/admin/monitor-sync`

Query recent backups:
```typescript
db.collection("metrics")
  .where("type", "==", "backup")
  .where("action", "==", "firestore_backup")
  .orderBy("timestamp", "desc")
  .limit(10)
```

---

## 🔧 Manual Operations

### 1. Manual Backup (Emergency)
Trigger an immediate backup via HTTP endpoint:

```bash
curl -X POST https://us-central1-theqah.cloudfunctions.net/manualBackup \
  -H "Authorization: Bearer RkTrCoGuHAS3p9x5Kw4V2iX0JcnZYyNO" \
  -H "Content-Type: application/json"
```

**Use cases:**
- Before major deployments
- After critical data operations
- When testing backup system

---

### 2. List Available Backups
```bash
# Using Firebase CLI
firebase storage:list backups/

# Using gsutil (Google Cloud SDK)
gsutil ls gs://theqah-backups/backups/
```

---

### 3. Download Specific Backup
```bash
# Download entire backup folder
gsutil -m cp -r gs://theqah-backups/backups/2025-12-17-1734393600000/ ./local-backup/

# Download single collection
gsutil cp gs://theqah-backups/backups/2025-12-17-1734393600000/reviews.json ./reviews-backup.json
```

---

## 🔄 Disaster Recovery

### Full Restoration Process

#### Step 1: Identify Backup
```bash
# List backups with dates
gsutil ls gs://theqah-backups/backups/

# Download metadata to verify backup integrity
gsutil cp gs://theqah-backups/backups/2025-12-17-1734393600000/metadata.json ./
cat metadata.json
```

#### Step 2: Restore Collection (HTTP API)
```bash
curl -X POST https://us-central1-theqah.cloudfunctions.net/restoreFromBackup \
  -H "Authorization: Bearer RkTrCoGuHAS3p9x5Kw4V2iX0JcnZYyNO" \
  -H "Content-Type: application/json" \
  -d '{
    "backupDate": "2025-12-17-1734393600000",
    "collectionName": "reviews",
    "mode": "merge",
    "confirmationToken": "CONFIRM_RESTORE"
  }'
```

**Parameters:**
- `backupDate`: Folder name from Cloud Storage
- `collectionName`: Which collection to restore
- `mode`: 
  - `"merge"` - Merge with existing data (safer)
  - `"overwrite"` - Replace all documents (⚠️ destructive)
- `confirmationToken`: Must be `"CONFIRM_RESTORE"` (safety check)

**Response:**
```json
{
  "success": true,
  "message": "Restored 15432 documents",
  "collection": "reviews",
  "backupDate": "2025-12-17-1734393600000"
}
```

#### Step 3: Verify Restoration
```typescript
// Check document counts
const restoredCount = await db.collection("reviews").count().get();
console.log(`Restored documents: ${restoredCount.data().count}`);

// Spot-check recent documents
const recentDocs = await db.collection("reviews")
  .orderBy("createdAt", "desc")
  .limit(10)
  .get();
```

---

## 🛡️ Security

### Authentication
- **Admin Secret Required:** All backup operations require `ADMIN_SECRET`
- **Double Confirmation:** Restore operations require explicit confirmation token
- **Audit Trail:** All backup/restore operations logged to metrics

### Access Control
```bash
# Grant access to backup bucket (if needed)
gsutil iam ch user:admin@theqah.com:objectViewer gs://theqah-backups
```

---

## 📈 Performance

### Typical Backup Times
- **Small dataset** (< 10K docs): 30-60 seconds
- **Medium dataset** (10K-100K docs): 2-5 minutes
- **Large dataset** (100K-1M docs): 5-15 minutes

### Resource Usage
- **Cloud Function Memory:** 256MB (default)
- **Timeout:** 540 seconds (9 minutes max)
- **Storage Cost:** ~$0.02/GB/month (Standard Storage)

### Optimization Tips
- Backups run during off-peak hours (3 AM UTC)
- Batched writes for efficient restoration
- Compressed JSON format reduces storage costs

---

## 🔍 Troubleshooting

### Backup Failed
1. Check Cloud Function logs:
   ```bash
   firebase functions:log --only backupFirestore
   ```

2. Verify storage bucket exists:
   ```bash
   gsutil ls gs://theqah-backups
   ```

3. Check metrics collection for error details:
   ```typescript
   db.collection("metrics")
     .where("type", "==", "backup")
     .where("success", "==", false)
     .orderBy("timestamp", "desc")
     .limit(5)
   ```

### Restore Failed
- **Error: "Backup not found"**
  - Verify backup date format: `YYYY-MM-DD-timestamp`
  - Check if backup folder exists in Cloud Storage

- **Error: "Unauthorized"**
  - Verify `ADMIN_SECRET` is correct
  - Ensure `confirmationToken` is exactly `"CONFIRM_RESTORE"`

- **Error: "Timeout"**
  - Large collections may timeout - restore in smaller batches
  - Increase Cloud Function timeout in `firebase.json`

---

## 📋 Maintenance Checklist

### Weekly
- [ ] Verify last 7 backups completed successfully
- [ ] Check backup sizes are reasonable (no unexpected growth)
- [ ] Monitor storage costs

### Monthly
- [ ] Test restoration process with sample data
- [ ] Review retention policy (adjust if needed)
- [ ] Audit backup access logs

### Quarterly
- [ ] Full disaster recovery drill
- [ ] Update documentation
- [ ] Review and optimize backup collections list

---

## 🚀 Deployment

### Initial Setup
```bash
# 1. Create backup bucket (if doesn't exist)
gsutil mb -l us-central1 gs://theqah-backups

# 2. Set lifecycle policy for 30-day retention
gsutil lifecycle set lifecycle-policy.json gs://theqah-backups

# 3. Deploy backup functions
cd functions
npm run build
firebase deploy --only functions:backupFirestore,functions:manualBackup,functions:restoreFromBackup
```

### Verify Deployment
```bash
# Check function exists
firebase functions:list | grep backup

# Test manual backup
curl -X POST https://us-central1-theqah.cloudfunctions.net/manualBackup \
  -H "Authorization: Bearer $ADMIN_SECRET"
```

---

## 📚 Additional Resources

- [Firebase Admin SDK - Firestore](https://firebase.google.com/docs/firestore/manage-data/export-import)
- [Cloud Storage Best Practices](https://cloud.google.com/storage/docs/best-practices)
- [Firebase Functions Scheduled](https://firebase.google.com/docs/functions/schedule-functions)

---

## 📞 Support

For backup-related issues:
1. Check monitoring dashboard: `/api/admin/monitor-sync`
2. Review Cloud Function logs: `firebase functions:log`
3. Check alerts collection: `db.collection("alerts")`

**Emergency Contact:** admin@theqah.com

---

**Last Updated:** December 17, 2025  
**Version:** 1.0.0  
**Status:** ✅ Production Ready
