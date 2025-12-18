# Migrating Salla Review Sync from GitHub Actions to Google Cloud Build

## Overview

This guide explains how to migrate your Salla review synchronization from GitHub Actions to Google Cloud Build (GCB). GCB offers better integration with Firebase/Firestore, lower latency, and more flexible scheduling.

## Benefits of GCB

- ✅ **Better Firebase Integration**: Direct access to Firebase without authentication overhead
- ✅ **Lower Latency**: Runs in the same region as your Firebase project
- ✅ **Cost Effective**: Free tier includes 120 build-minutes/day
- ✅ **Flexible Scheduling**: Cloud Scheduler triggers with cron expressions
- ✅ **Native Secrets**: Built-in Secret Manager integration
- ✅ **Better Monitoring**: Integrated with Cloud Logging and Monitoring

## Prerequisites

1. Google Cloud Project with billing enabled
2. Firebase project linked to GCP project
3. Cloud Build API enabled
4. Cloud Scheduler API enabled
5. Secret Manager API enabled
6. Required permissions (Owner or Editor role)

## Step 1: Enable Required APIs

```bash
# Enable APIs
gcloud services enable cloudbuild.googleapis.com
gcloud services enable cloudscheduler.googleapis.com
gcloud services enable secretmanager.googleapis.com

# Verify APIs are enabled
gcloud services list --enabled
```

## Step 2: Create Secrets in Secret Manager

Create secrets for sensitive credentials:

```bash
# Create CRON_SECRET
echo -n "your-cron-secret-value" | gcloud secrets create CRON_SECRET \
  --data-file=- \
  --replication-policy="automatic"

# Create ADMIN_SECRET (if needed)
echo -n "your-admin-secret-value" | gcloud secrets create ADMIN_SECRET \
  --data-file=- \
  --replication-policy="automatic"

# Grant Cloud Build access to secrets
PROJECT_NUMBER=$(gcloud projects describe $(gcloud config get-value project) --format='value(projectNumber)')

gcloud secrets add-iam-policy-binding CRON_SECRET \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding ADMIN_SECRET \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

## Step 3: Create Cloud Build Configuration

Create `cloudbuild.yaml` in your repository root:

```yaml
# cloudbuild.yaml - Salla Reviews Sync Trigger

steps:
  # Step 1: Trigger full sync endpoint
  - name: 'gcr.io/cloud-builders/curl'
    id: 'sync-all-stores'
    args:
      - '-X'
      - 'POST'
      - 'https://your-app.vercel.app/api/cron/sync-all'
      - '-H'
      - 'x-vercel-cron-secret: $$CRON_SECRET'
      - '-H'
      - 'Content-Type: application/json'
      - '--max-time'
      - '540'  # 9 minutes timeout
      - '--fail'  # Fail on HTTP errors
      - '--show-error'
      - '--silent'
    secretEnv: ['CRON_SECRET']
    timeout: 600s  # 10 minutes max

  # Step 2: Trigger incremental sync (optional)
  - name: 'gcr.io/cloud-builders/curl'
    id: 'incremental-sync'
    waitFor: ['sync-all-stores']  # Run after full sync
    args:
      - '-X'
      - 'POST'
      - 'https://your-app.vercel.app/api/cron/sync-incremental'
      - '-H'
      - 'x-vercel-cron-secret: $$CRON_SECRET'
      - '-H'
      - 'Content-Type: application/json'
      - '--max-time'
      - '300'
      - '--fail'
    secretEnv: ['CRON_SECRET']
    timeout: 360s

# Available secrets from Secret Manager
availableSecrets:
  secretManager:
    - versionName: projects/$PROJECT_ID/secrets/CRON_SECRET/versions/latest
      env: 'CRON_SECRET'
    - versionName: projects/$PROJECT_ID/secrets/ADMIN_SECRET/versions/latest
      env: 'ADMIN_SECRET'

# Build timeout
timeout: 1200s  # 20 minutes total

# Options
options:
  logging: CLOUD_LOGGING_ONLY
  machineType: 'E2_HIGHCPU_8'  # Faster execution
  substitutionOption: 'ALLOW_LOOSE'
  
# Substitutions (can be overridden)
substitutions:
  _SYNC_TIMEOUT: '540'
  _APP_URL: 'https://your-app.vercel.app'
```

## Step 4: Create Cloud Scheduler Trigger

Create a Cloud Scheduler job to trigger Cloud Build:

```bash
# Set variables
PROJECT_ID=$(gcloud config get-value project)
REGION="us-central1"  # Choose your region
APP_URL="https://your-app.vercel.app"

# Create scheduler job
gcloud scheduler jobs create http salla-sync-hourly \
  --location=$REGION \
  --schedule="0 * * * *" \
  --uri="https://cloudbuild.googleapis.com/v1/projects/$PROJECT_ID/triggers/salla-sync-trigger:run" \
  --http-method=POST \
  --oauth-service-account-email="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --oauth-token-scope="https://www.googleapis.com/auth/cloud-platform" \
  --message-body='{"branchName":"main"}' \
  --time-zone="Asia/Riyadh" \
  --description="Hourly Salla reviews sync via Cloud Build"
```

## Step 5: Create Cloud Build Trigger

### Option A: Using gcloud CLI

```bash
gcloud builds triggers create manual \
  --name="salla-sync-trigger" \
  --region=$REGION \
  --build-config=cloudbuild.yaml \
  --repo="https://github.com/YOUR_USERNAME/YOUR_REPO" \
  --repo-type=GITHUB \
  --branch="main"
```

### Option B: Using Cloud Console

1. Go to **Cloud Build > Triggers**
2. Click **CREATE TRIGGER**
3. Configure:
   - **Name**: `salla-sync-trigger`
   - **Region**: `us-central1` (or your preferred region)
   - **Event**: Manual invocation
   - **Source**: Your GitHub repository
   - **Branch**: `main`
   - **Configuration**: Cloud Build configuration file
   - **Location**: `/cloudbuild.yaml`
4. Click **CREATE**

## Step 6: Test the Setup

### Test Cloud Build manually:

```bash
# Trigger build manually
gcloud builds triggers run salla-sync-trigger \
  --region=$REGION \
  --branch=main

# View build logs
gcloud builds log --stream $(gcloud builds list --limit=1 --format='value(ID)')
```

### Test Cloud Scheduler:

```bash
# Trigger scheduler job manually
gcloud scheduler jobs run salla-sync-hourly \
  --location=$REGION

# View logs
gcloud logging read "resource.type=cloud_scheduler_job" \
  --limit=10 \
  --format=json
```

## Step 7: Update Your Application

Update your API endpoints to handle GCB requests:

```typescript
// src/pages/api/cron/sync-all.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyCronSecret } from '@/server/middleware/cron-auth';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Verify cron secret
  const isValid = await verifyCronSecret(req);
  if (!isValid) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Allow GCB user agent
  const userAgent = req.headers['user-agent'] || '';
  const isGCB = userAgent.includes('Google-Cloud-Builder');
  const isGitHub = userAgent.includes('GitHub-Hookshot');
  
  if (!isGCB && !isGitHub) {
    return res.status(403).json({ error: 'Invalid source' });
  }

  try {
    // Your sync logic here
    const result = await syncAllStores();
    
    return res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('[SYNC_CRON] Error:', error);
    return res.status(500).json({ 
      success: false, 
      error: String(error) 
    });
  }
}
```

## Step 8: Monitoring and Alerts

### Set up log-based alerts:

```bash
# Create alert for failed builds
gcloud alpha monitoring policies create \
  --notification-channels=YOUR_CHANNEL_ID \
  --display-name="Salla Sync Failed" \
  --condition-display-name="Build Failure" \
  --condition-threshold-value=1 \
  --condition-threshold-duration=60s \
  --condition-filter='resource.type="cloud_build"
    AND log_name="projects/'$PROJECT_ID'/logs/cloudbuild"
    AND jsonPayload.status="FAILURE"'
```

### View logs in Cloud Console:

```
https://console.cloud.google.com/cloud-build/builds?project=YOUR_PROJECT_ID
```

## Step 9: Clean Up GitHub Actions (Optional)

Once GCB is working:

1. Archive or delete `.github/workflows/sync-salla-reviews.yml`
2. Remove GitHub Actions secrets if no longer needed
3. Update documentation

```bash
# Archive GitHub Actions workflow
git mv .github/workflows/sync-salla-reviews.yml \
       .github/workflows/archived/sync-salla-reviews.yml.bak

git commit -m "Archive GitHub Actions sync (migrated to GCB)"
git push
```

## Scheduling Options

### Common Cron Schedules:

```yaml
# Every hour
schedule: "0 * * * *"

# Every 30 minutes
schedule: "*/30 * * * *"

# Every 6 hours
schedule: "0 */6 * * *"

# Daily at 2 AM (Riyadh time)
schedule: "0 2 * * *"
time-zone: "Asia/Riyadh"

# Every weekday at 9 AM
schedule: "0 9 * * 1-5"

# Every 15 minutes during business hours (9 AM - 5 PM)
schedule: "*/15 9-17 * * *"
```

## Advanced: Multiple Sync Jobs

Create separate jobs for different sync strategies:

```bash
# Full sync - Every 6 hours
gcloud scheduler jobs create http salla-sync-full \
  --schedule="0 */6 * * *" \
  --location=$REGION \
  --uri="https://cloudbuild.googleapis.com/v1/projects/$PROJECT_ID/triggers/salla-sync-full:run" \
  --http-method=POST \
  --oauth-service-account-email="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# Incremental sync - Every hour
gcloud scheduler jobs create http salla-sync-incremental \
  --schedule="0 * * * *" \
  --location=$REGION \
  --uri="https://cloudbuild.googleapis.com/v1/projects/$PROJECT_ID/triggers/salla-sync-incremental:run" \
  --http-method=POST \
  --oauth-service-account-email="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# Priority stores - Every 30 minutes
gcloud scheduler jobs create http salla-sync-priority \
  --schedule="*/30 * * * *" \
  --location=$REGION \
  --uri="https://cloudbuild.googleapis.com/v1/projects/$PROJECT_ID/triggers/salla-sync-priority:run" \
  --http-method=POST \
  --oauth-service-account-email="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
```

## Cost Estimation

### Cloud Build Free Tier:
- **120 build-minutes/day**: Free
- **Beyond free tier**: $0.003/build-minute
- **Example**: 24 hourly builds × 5 minutes = 120 minutes/day = FREE

### Cloud Scheduler:
- **3 jobs**: Free
- **Beyond 3 jobs**: $0.10/job/month

### Estimated Monthly Cost:
- With 3 or fewer jobs: **$0**
- With more than 3 jobs: **~$0.10 per additional job**

## Troubleshooting

### Build Fails with "Unauthorized"

```bash
# Check Secret Manager permissions
gcloud secrets get-iam-policy CRON_SECRET

# Grant access if missing
PROJECT_NUMBER=$(gcloud projects describe $(gcloud config get-value project) --format='value(projectNumber)')
gcloud secrets add-iam-policy-binding CRON_SECRET \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### Build Times Out

```yaml
# Increase timeout in cloudbuild.yaml
timeout: 1800s  # 30 minutes

# Or per step:
- name: 'gcr.io/cloud-builders/curl'
  timeout: 900s  # 15 minutes
```

### Scheduler Job Not Triggering

```bash
# Check job status
gcloud scheduler jobs describe salla-sync-hourly --location=$REGION

# Check logs
gcloud logging read "resource.type=cloud_scheduler_job" \
  --limit=50 \
  --format=json

# Test manually
gcloud scheduler jobs run salla-sync-hourly --location=$REGION
```

### Secret Not Found

```bash
# Verify secret exists
gcloud secrets list

# Verify version
gcloud secrets versions list CRON_SECRET

# Create new version if needed
echo -n "new-secret-value" | gcloud secrets versions add CRON_SECRET --data-file=-
```

## Migration Checklist

- [ ] Enable required GCP APIs
- [ ] Create secrets in Secret Manager
- [ ] Grant Cloud Build access to secrets
- [ ] Create `cloudbuild.yaml` in repository
- [ ] Create Cloud Build trigger
- [ ] Create Cloud Scheduler job
- [ ] Test build manually
- [ ] Test scheduler manually
- [ ] Update API endpoints to accept GCB requests
- [ ] Set up monitoring and alerts
- [ ] Monitor for 24-48 hours
- [ ] Archive GitHub Actions workflow
- [ ] Update documentation

## Support

For issues:
- **Cloud Build docs**: https://cloud.google.com/build/docs
- **Cloud Scheduler docs**: https://cloud.google.com/scheduler/docs
- **Secret Manager docs**: https://cloud.google.com/secret-manager/docs
- **Cron syntax**: https://crontab.guru/

---

**Last Updated**: December 18, 2025
**Version**: 1.0.0
