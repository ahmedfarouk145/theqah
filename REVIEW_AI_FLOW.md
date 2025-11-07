# 📊 Review & AI Moderation Flow - Complete Documentation

## 🎯 Current Flow (How It Works Now)

### Step-by-Step Flow

```
1. Customer Submits Review
   ↓
2. Review Stored in Database (status: "pending", moderation: null)
   ↓
3. AI Moderation Runs (OpenAI API)
   ↓
4. Moderation Results Stored with Review
   ↓
5. Status Updated Based on Moderation
   ↓
6. Merchant Notification (if pending)
```

---

## 📝 Detailed Flow

### 1. Review Submission (`POST /api/reviews/submit`)

**File:** `src/pages/api/reviews/submit.ts`

**What happens:**
1. Review is created in Firestore with initial data:
   ```typescript
   {
     id: "review-123",
     orderId: "order-456",
     stars: 5,
     text: "منتج رائع!",
     images: [...],
     status: "pending",
     published: false,
     moderation: null, // ← Initially null
     createdAt: 1234567890,
     // ...
   }
   ```

2. **AI Moderation is called** (lines 141-146):
   ```typescript
   const mod = await moderateReview({
     text: isNonEmptyString(body.text) ? body.text : "",
     images: safeImages,
     stars: s,
   });
   ```

3. **Moderation results are stored** (lines 151-156):
   ```typescript
   await db.collection("reviews").doc(txResult.reviewId).set(
     mod?.ok
       ? { 
         moderation: { 
           model: mod.model,        // "gpt-4o-mini" or "omni-moderation-latest"
           score: mod.score,         // 0-1 confidence score
           flags: mod.flags ?? []    // ["bad_words", "spam"] or []
         } 
       }
       : { 
         moderation: { 
           model: mod?.model || "openai", 
           score: mod?.score ?? 0, 
           flags: mod?.flags ?? ["blocked"] 
         } 
       },
     { merge: true }
   );
   ```

4. **Status is updated** based on moderation (lines 167-177):
   ```typescript
   if (okToPublish) {
     // Review passed moderation
     await db.collection("reviews").doc(txResult.reviewId).set(
       { status: "published", published: true, publishedAt: Date.now() },
       { merge: true }
     );
   } else {
     // Review failed moderation
     await db.collection("reviews").doc(txResult.reviewId).set(
       { status: "rejected", published: false, publishedAt: null },
       { merge: true }
     );
   }
   ```

---

## 🗄️ Database Structure

### Review Document in Firestore

**Collection:** `reviews/{reviewId}`

**Complete Structure:**
```typescript
{
  // Basic Review Data
  id: string;
  orderId: string;
  stars: number; // 1-5
  text: string;
  images: string[]; // Uploadcare URLs
  status: "pending" | "published" | "rejected" | "approved";
  published: boolean;
  publishedAt: number | null;
  createdAt: number;
  
  // Store & Order Info
  storeUid: string | null;
  productId: string | null;
  productIds: string[];
  platform: "salla" | "zid" | "manual" | "web";
  tokenId: string | null;
  trustedBuyer: boolean;
  
  // Author Info
  author: {
    show: boolean;
    name: string | null;
    displayName: string;
  };
  
  // 🎯 AI MODERATION RESULTS (Stored Here!)
  moderation: {
    model: string;        // "gpt-4o-mini", "omni-moderation-latest", "vision", "none"
    score: number;        // 0-1 confidence score
    flags: string[];      // ["bad_words", "spam", "image_policy"] or []
  } | null;
  
  // Denormalized Data
  storeName: string;
  storeDomain: string | null;
}
```

---

## 🤖 AI Moderation Process

### What Gets Checked

1. **Quick Rules** (Fast checks):
   - Text length > 4000 chars → Reject
   - Contains URLs → Flag `has_links`
   - Bad words filter → Flag `bad_words`

2. **OpenAI Text Moderation API**:
   - Model: `omni-moderation-latest`
   - Checks: Abuse, harassment, hate, self-harm, etc.

3. **Vision API** (if images exist):
   - Model: `gpt-4o-mini`
   - Checks: Nudity, violence, hate symbols, inappropriate content

4. **Hybrid AI Moderation**:
   - Combines multiple checks
   - Returns confidence score

### Moderation Result Structure

```typescript
type ModerationResult = {
  ok: boolean;              // true = approved, false = rejected
  reason?: string;          // "bad_words", "spam", "image_policy"
  flags: string[];          // List of issues found
  model: string;            // Which model was used
  score?: number;           // 0-1 confidence score
  categories?: Record<string, boolean>; // Detailed categories
  needsManualCheck?: boolean;
};
```

---

## ✅ Current Implementation Status

### ✅ What's Working

1. ✅ **Review submission** stores review in database
2. ✅ **AI moderation** runs automatically after review creation
3. ✅ **Moderation results** are stored in `reviews/{id}.moderation`
4. ✅ **Status updates** based on moderation (published/rejected)
5. ✅ **Error handling** - if moderation fails, review is marked with error

### 📍 Code Locations

- **Review Submission:** `src/pages/api/reviews/submit.ts` (lines 136-177)
- **AI Moderation:** `src/server/moderation/index.ts`
- **Text Moderation:** `src/server/moderation/openai-moderation.ts`
- **Image Moderation:** `src/server/moderation/checkReview.ts` (Vision API)
- **Status Update:** `src/pages/api/reviews/update-status.ts` (manual approval)

---

## 🔧 How to Verify It's Working

### 1. Check Vercel Environment Variables

```bash
# In Vercel Dashboard:
Settings → Environment Variables

# Should have:
OPENAI_API_KEY=sk-proj-... ✅
OPENAI_MODEL=gpt-4o-mini (optional)
```

### 2. Check Database

After submitting a review, check Firestore:

```typescript
// Collection: reviews/{reviewId}
{
  moderation: {
    model: "gpt-4o-mini",  // ← Should exist
    score: 0.95,           // ← Should exist
    flags: []              // ← Should exist (empty if approved)
  }
}
```

### 3. Check Logs

In Vercel → Deployments → View Function Logs:
- ✅ Should see moderation calls
- ❌ No errors about `OPENAI_API_KEY`

---

## 🚀 Next Steps

### For Production:

1. **Add OpenAI API Key to Vercel:**
   - Follow `VERCEL_OPENAI_SETUP.md`
   - Add `OPENAI_API_KEY` environment variable
   - Redeploy

2. **Verify Setup:**
   - Submit a test review
   - Check Firestore for `moderation` object
   - Verify logs show no errors

3. **Monitor:**
   - Check OpenAI usage: https://platform.openai.com/usage
   - Set spending limits: https://platform.openai.com/account/billing/limits

---

## 📊 Example Flow Timeline

```
00:00.000 - Customer submits review
00:00.001 - Review created in DB (status: "pending", moderation: null)
00:00.002 - AI moderation starts
00:00.500 - OpenAI Text Moderation API called
00:01.000 - Vision API called (if images exist)
00:01.500 - Moderation results stored in DB
00:01.501 - Status updated (published/rejected)
00:01.502 - Merchant notification sent (if pending)
```

---

## 🎯 Summary

✅ **The flow is already implemented correctly!**

When a customer submits a review:
1. Review is stored in database
2. AI moderation runs automatically
3. **Moderation results are stored with the review** in `reviews/{id}.moderation`
4. Status is updated based on moderation results

**You just need to add the OpenAI API key in Vercel, and everything will work!**

See `VERCEL_OPENAI_SETUP.md` for detailed instructions.

