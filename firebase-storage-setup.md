# Firebase Storage Setup Guide

## Step 1: Enable Firebase Storage
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project: `theqah-d3ee0`
3. Click **"Storage"** in the left sidebar
4. Click **"Get started"**
5. Choose **"Start in test mode"** (for development)
6. Select a location (choose closest to your users, e.g., `us-central1`)

## Step 2: Add Storage Bucket to Environment
Add this to your `.env.local` file:
```bash
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=theqah-d3ee0.appspot.com
```

## Step 3: Update Storage Rules
Go to **Storage** → **Rules** and replace with:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /uploads/{allPaths=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## Step 4: Test the Upload
1. Restart your dev server: `npm run dev`
2. Go to a review page and try uploading images
3. Check Firebase Console → Storage to see uploaded files

## What Changed
- ✅ Removed Uploadcare dependency
- ✅ Created `FirebaseStorageWidget.tsx` component
- ✅ Updated `firebase.ts` to include storage bucket
- ✅ Updated review page to use Firebase Storage
- ✅ Added graceful error handling for when Storage isn't enabled yet
- ✅ Files are stored in `/uploads/` folder in Firebase Storage

## Benefits
- 🆓 **Free tier**: 5GB storage, 1GB/day downloads
- 🔒 **Secure**: Uses Firebase Auth
- 🌍 **CDN**: Global content delivery
- 📱 **Mobile-friendly**: Works on all devices
- 🚀 **Fast**: Optimized for performance

## File Structure
```
Firebase Storage:
├── uploads/
│   ├── 1703123456789_image1.jpg
│   ├── 1703123456790_image2.png
│   └── ...
```

## Troubleshooting
- **Permission denied**: Check Storage rules
- **Upload fails**: Check Firebase project settings
- **Images not showing**: Check Firebase Storage console
- **Storage not enabled**: Component shows warning message until you upgrade Firebase plan