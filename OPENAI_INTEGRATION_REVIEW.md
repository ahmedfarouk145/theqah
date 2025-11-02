# مراجعة شاملة لتكامل OpenAI

## 📋 نظرة عامة

OpenAI مستخدم في المشروع لثلاثة أغراض رئيسية:
1. **فحص محتوى التقييمات** (Content Moderation) - Text & Images
2. **تحليل البيانات** (Analytics Insights) - AI-powered recommendations
3. **فلترة الصور** (Vision API) - Image content check

---

## 🏗️ البنية المعمارية

### نظام Moderation (3 طبقات)

```
┌─────────────────────────────────────────────────────────┐
│              Review Submission                         │
│              (POST /api/reviews/submit)                 │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│       Layer 1: Quick Heuristics (Local)                │
│       ├─ Bad words filter (bad-words library)          │
│       ├─ URL check (>3 links = spam)                   │
│       └─ Length check (>4000 chars = too_long)         │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼ (if passed)
┌─────────────────────────────────────────────────────────┐
│       Layer 2: OpenAI Moderation API                  │
│       ├─ Model: omni-moderation-latest                 │
│       ├─ Timeout: 4 seconds                            │
│       └─ Retry: 2 attempts (429/5xx)                  │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼ (if flagged OR costSaving=false)
┌─────────────────────────────────────────────────────────┐
│       Layer 3: GPT Prompt-based Moderation             │
│       ├─ Model: gpt-4o-mini                            │
│       ├─ JSON-structured response                     │
│       └─ Returns: flagged, reasons, categories, conf   │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼ (if images provided)
┌─────────────────────────────────────────────────────────┐
│       Layer 4: Vision API (Images)                     │
│       ├─ Model: gpt-4o-mini                            │
│       ├─ Max images: 4 (Uploadcare only)               │
│       └─ Checks: nudity, violence, hate, harassment    │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│              Final Decision                             │
│              ├─ ok: true → publish                     │
│              └─ ok: false → reject/pending             │
└─────────────────────────────────────────────────────────┘
```

---

## 📂 الملفات والاستخدامات

### 1. Moderation System

#### `src/server/moderation/index.ts` (Main Entry)
**الدور:** Hybrid moderation system يجمع API + Prompt
```typescript
export async function moderateReview(input: ModerationInput): Promise<ModerationResult>
```
**الميزات:**
- ✅ Quick heuristics أولاً (bad-words, URLs, length)
- ✅ يجمع Moderation API + Prompt-based
- ✅ Cost-saving mode (Prompt فقط إذا needed)
- ✅ Returns unified result

#### `src/server/moderation/openai-moderation.ts`
**الدور:** OpenAI Moderation API wrapper
```typescript
export async function moderateByApi(text: string): Promise<ApiModerationDecision>
```
**الميزات:**
- ✅ Model: `omni-moderation-latest`
- ✅ Timeout: 4 seconds
- ✅ Retry logic: 2 attempts (429/5xx errors)
- ✅ Returns: `flagged`, `categories`, `category_scores`, `model`, `timedOut`

**الكود:**
```typescript
const resp = await client.moderations.create({
  model: 'omni-moderation-latest',
  input: content
});
```

#### `src/server/moderation/prompt.ts`
**الدور:** GPT-based moderation using prompts
```typescript
export async function moderateByPrompt(text: string): Promise<PromptDecision>
```
**الميزات:**
- ✅ Model: `gpt-4o-mini`
- ✅ JSON-structured response
- ✅ Temperature: 0 (deterministic)
- ✅ Returns: `flagged`, `reasons[]`, `categories`, `confidence`, `model`

**System Prompt:**
```
أنت مُصنّف محتوى عربي/إنجليزي. أعد **JSON فقط**:
{
  "flagged": boolean,
  "reasons": string[],   // بالعربية وباقتضاب
  "categories": { "hate"?: boolean, ... },
  "confidence": number   // من 0 إلى 1
}
```

**Retry Logic:**
- 2 attempts
- إذا رجع JSON غير صحيح في المحاولة الأولى، يحاول مرة أخرى
- إذا كان خطأ 429/5xx، يحاول مرة أخرى بعد delay

#### `src/server/moderation/checkReview.ts`
**الدور:** Review check مع دعم الصور (Vision API)
```typescript
export async function checkReviewModeration(
  text: string,
  images?: string[]
): Promise<ModerationVerdict>
```
**الميزات:**
- ✅ Quick heuristics أولاً
- ✅ OpenAI Text Moderation
- ✅ Vision API للصور (gpt-4o-mini)
- ✅ يدعم حتى 4 صور من Uploadcare فقط

**Vision API Usage:**
```typescript
const resp = await client.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [
    {
      role: "system",
      content: "You are a strict safety image moderator..."
    },
    {
      role: "user",
      content: [
        { type: "text", text: "حلّل الصور..." },
        ...imageUrls.map(url => ({
          type: "image_url",
          image_url: { url }
        }))
      ]
    }
  ]
});
```

**ملاحظة:** هذا الملف يُستخدم في `checkReviewModeration` لكن لا يُستخدم حاليًا في `moderateReview`!

---

### 2. AI Insights

#### `src/pages/api/ai/insights.ts`
**الدور:** AI-powered analytics insights
```typescript
POST /api/ai/insights
{
  data: {
    totalOrders: number,
    totalReviews: number,
    positiveRate: number,
    ordersChart: Array<{month, count}>,
    reviewsChart: Array<{month, positive, negative}>
  }
}
```

**الميزات:**
- ✅ Model: `gpt-4o-mini` (configurable via `OPENAI_MODEL`)
- ✅ Temperature: 0.3
- ✅ Max tokens: 500
- ✅ Returns 4-6 actionable insights in Arabic

**Example Output:**
```
✅ زيادة في الطلبات بنسبة 20% هذا الشهر
📊 نسبة الإيجابية 85% - ممتاز!
⚠️ انتبه للانخفاض في التقييمات السلبية
💡 ركز على المنتجات الأكثر تقييمًا
```

---

## 🔧 التكوين والإعدادات

### Environment Variables

```bash
# Required
OPENAI_API_KEY=sk-...        # Min 20 chars (validated in src/lib/env.ts)

# Optional
OPENAI_MODEL=gpt-4o-mini     # Default for chat completions
```

**التحقق:**
- `src/lib/env.ts` يتحقق من وجود `OPENAI_API_KEY` عند تحميل الملف
- إذا لم يكن موجودًا، سيتم رمي خطأ `ZodError`

### Models Configuration

| الاستخدام | Model | Default | Configurable |
|----------|-------|---------|--------------|
| Text Moderation | `omni-moderation-latest` | ✅ | ❌ (hardcoded) |
| Prompt Moderation | `gpt-4o-mini` | ✅ | ❌ (hardcoded) |
| Vision API | `gpt-4o-mini` | ✅ | ❌ (hardcoded) |
| AI Insights | `gpt-4o-mini` | ✅ | ✅ (`OPENAI_MODEL` env var) |

### Timeouts & Retries

| Function | Timeout | Retries | Retry Condition |
|----------|---------|---------|-----------------|
| `moderateByApi` | 4 seconds | 2 attempts | 429, 5xx errors |
| `moderateByPrompt` | None | 2 attempts | 429, 5xx errors |
| Vision API | None | No retry | ❌ |
| AI Insights | None | No retry | ❌ |

---

## 💰 التكلفة المحتملة

### Cost per Review

| API Call | Model | Input | Estimated Cost |
|----------|-------|-------|----------------|
| Moderation API | `omni-moderation-latest` | Text | ~$0.00001 |
| Prompt Moderation | `gpt-4o-mini` | Text (~100 tokens) | ~$0.00002 |
| Vision API | `gpt-4o-mini` | 1-4 images | ~$0.0001-0.0004 |
| **Total per Review** | | | **~$0.00001 - $0.0005** |

**ملاحظة:** 
- إذا `costSaving=true`: فقط Moderation API (~$0.00001)
- إذا `costSaving=false`: Moderation API + Prompt (~$0.00003)
- إذا كانت صور: + Vision API (~$0.0001-0.0004)

### AI Insights Cost

| Call | Model | Input | Estimated Cost |
|------|-------|-------|----------------|
| Insights | `gpt-4o-mini` | ~200 tokens | ~$0.00004 |

---

## ⚠️ المشاكل والمخاطر

### 1. ✅ تم إصلاحه: دمج Vision API في moderateReview

**المشكلة (كانت):** `checkReviewModeration` (الذي يستخدم Vision API) لا يُستخدم في `moderateReview`!

**الحل (تم):** تم دمج Vision API في `moderateReview`:

```typescript
// src/server/moderation/index.ts
// 2) فحص الصور أولاً (إذا كانت موجودة) - Vision API
if (input.images && input.images.length > 0) {
  try {
    const visionResult = await checkReviewModeration(text, input.images);
    if (!visionResult.allowed) {
      return { ok: false, reason: visionResult.reasons?.[0] || "image_policy", ... };
    }
  } catch (e) {
    console.error("[moderation] Vision API failed:", e);
    flags.push("vision_error");
  }
}
```

**النتيجة:** ✅ الصور الآن يتم فحصها في `moderateReview`!

### 2. ⚠️ تكرار OpenAI Client

**المشكلة:** يتم إنشاء `OpenAI` client في 4 ملفات مختلفة:
- `src/server/moderation/openai-moderation.ts`
- `src/server/moderation/prompt.ts`
- `src/server/moderation/checkReview.ts`
- `src/pages/api/ai/insights.ts`

**المشكلة:**
- تكرار الكود
- إذا تغيرت طريقة إنشاء client، يجب تحديث 4 ملفات
- قد يؤدي لمشاكل في configuration

**الحل المقترح:**
إنشاء `src/lib/openai.ts`:
```typescript
import OpenAI from 'openai';

if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY is required');
}

export const openaiClient = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY 
});

export const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
export const MODERATION_MODEL = 'omni-moderation-latest';
```

### 3. ⚠️ Error Handling غير كامل

**المشكلة:**
- إذا فشل OpenAI API، يرجع `timedOut: true` لكن لا يُسجل تفاصيل الخطأ
- لا يوجد retry للـ Vision API
- لا يوجد fallback إذا فشل جميع APIs

### 4. ⚠️ Cost Optimization يحتاج تحسين

**المشكلة الحالية:**
```typescript
// costSaving mode logic
const needPrompt = !costSaving || api.flagged || api.timedOut;
```

**المشكلة:**
- إذا `costSaving=false`، يتم استدعاء Prompt دائماً حتى لو API passed
- هذا مكلف وغير ضروري

**الحل المقترح:**
```typescript
// Use costSaving=true by default
// Only call Prompt if API flagged or timed out
const needPrompt = api.flagged || api.timedOut;
```

### 5. ⚠️ Vision API بدون Timeout

**المشكلة:** Vision API لا يحتوي على timeout
- قد يستغرق وقتًا طويلاً
- قد يؤدي لـ hanging requests

**الحل المقترح:** إضافة timeout للـ Vision API calls

### 6. ⚠️ لا يوجد Rate Limiting

**المشكلة:** لا يوجد rate limiting للـ OpenAI API calls
- قد يؤدي لـ hitting OpenAI rate limits
- قد يؤدي لـ 429 errors متكررة

---

## ✅ التحسينات المقترحة

### 1. إنشاء OpenAI Client مركزي

**ملف جديد:** `src/lib/openai.ts`
```typescript
import OpenAI from 'openai';

if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY environment variable is required');
}

export const openaiClient = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY 
});

export const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
export const MODERATION_MODEL = 'omni-moderation-latest';

// Helper functions
export function withOpenAITimeout<T>(
  promise: Promise<T>, 
  ms = 10000
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error('openai_timeout')), ms)
    )
  ]);
}
```

### 2. دمج Vision API في moderateReview

**تحديث:** `src/server/moderation/index.ts`
```typescript
import { checkReviewModeration } from './checkReview';

export async function moderateReview(input: ModerationInput): Promise<ModerationResult> {
  // ... existing quick heuristics ...
  
  // If images provided, use checkReviewModeration
  if (input.images && input.images.length > 0) {
    const visionResult = await checkReviewModeration(input.text, input.images);
    if (!visionResult.allowed) {
      return {
        ok: false,
        reason: visionResult.reasons?.[0] || 'image_policy',
        flags: visionResult.reasons || [],
        categories: {},
        model: 'vision'
      };
    }
  }
  
  // ... continue with text moderation ...
}
```

### 3. تحسين Cost Optimization

**تحديث:** `src/server/moderation/index.ts`
```typescript
async function moderateHybrid(
  text: string,
  opts?: { costSaving?: boolean }
): Promise<HybridDecision> {
  // Default to costSaving=true to save costs
  const costSaving = opts?.costSaving ?? true;

  const api = await moderateByApi(text);

  // Only use Prompt if:
  // 1. API flagged (need second opinion)
  // 2. API timed out (need fallback)
  // 3. Explicitly requested (costSaving=false)
  let prompt: PromptDecision | undefined;
  const needPrompt = api.flagged || api.timedOut || !costSaving;
  if (needPrompt) {
    prompt = await moderateByPrompt(text);
  }
  // ... rest of the logic ...
}
```

### 4. إضافة Timeout للـ Vision API

**تحديث:** `src/server/moderation/checkReview.ts`
```typescript
async function checkImagesWithVision(
  imageUrls: string[]
): Promise<{ flagged: boolean; reasons: string[] }> {
  // ... existing code ...
  
  try {
    // Add timeout wrapper
    const resp = await Promise.race([
      client.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
        temperature: 0,
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('vision_timeout')), 10000)
      )
    ]);
    // ... rest of the logic ...
  } catch (e) {
    if (e.message === 'vision_timeout') {
      console.warn('Vision API timeout');
    }
    return { flagged: false, reasons: [] };
  }
}
```

### 5. إضافة Logging أفضل

**اقتراح:** إضافة logging للـ API calls:
- عدد الـ calls
- التكلفة المتوقعة
- الأخطاء والـ timeouts
- Rate limit hits

### 6. إضافة Metrics/Monitoring

**اقتراح:** تتبع:
- Moderation success/failure rate
- API response times
- Cost per review
- Timeout frequency

---

## 🧪 اختبار التكامل

### Test Moderation

```bash
# Test text moderation
curl -X POST http://localhost:3000/api/reviews/submit \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "TEST-001",
    "stars": 5,
    "text": "منتج رائع!",
    "tokenId": "..."
  }'
```

### Test Vision API

```typescript
import { checkReviewModeration } from '@/server/moderation/checkReview';

const result = await checkReviewModeration(
  "منتج جيد",
  ["https://ucarecdn.com/image1.jpg"]
);

console.log(result); // { allowed: true/false, reasons, category }
```

### Test AI Insights

```bash
curl -X POST http://localhost:3000/api/ai/insights \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {token}" \
  -d '{
    "data": {
      "totalOrders": 150,
      "totalReviews": 120,
      "positiveRate": 85,
      "ordersChart": [{"month": "2025-01", "count": 50}],
      "reviewsChart": [{"month": "2025-01", "positive": 40, "negative": 10}]
    }
  }'
```

---

## 📊 الإحصائيات الحالية

### API Calls per Review Submission

| المرحلة | API Call | Condition | Model | Cost |
|---------|----------|-----------|-------|------|
| Quick Heuristics | 0 | Always | - | $0 |
| Moderation API | 1 | Always | `omni-moderation-latest` | ~$0.00001 |
| Prompt Moderation | 0-1 | If flagged/timedOut OR !costSaving | `gpt-4o-mini` | ~$0.00002 |
| Vision API | 0-1 | If images provided | `gpt-4o-mini` | ~$0.0001-0.0004 |

**Total Cost per Review:**
- بدون صور + costSaving: ~$0.00001
- بدون صور + !costSaving: ~$0.00003
- مع صور (1-4): +$0.0001-0.0004

---

## ✅ الخلاصة

### ما يعمل بشكل جيد:
✅ Hybrid moderation system (API + Prompt)  
✅ Quick heuristics قبل API calls  
✅ Retry logic للـ 429/5xx errors  
✅ Cost-saving mode موجود  
✅ Error handling أساسي  
✅ Vision API للصور (لكن غير مستخدم!)  

### ما يحتاج تحسين:
✅ **تم إصلاحه:** Vision API الآن مستخدم في `moderateReview`  
⚠️ **تكرار OpenAI client** - يجب إنشاء client مركزي  
⚠️ **Cost optimization** يحتاج تحسين  
⚠️ **Error handling** غير كامل  
⚠️ **Timeout للـ Vision API** مفقود  
⚠️ **Rate limiting** مفقود  
⚠️ **Logging/Metrics** محدود  

### الأولويات:
1. ✅ **تم:** دمج Vision API في `moderateReview`
2. 🟡 **Medium Priority:** إنشاء OpenAI client مركزي
3. 🟡 **Medium Priority:** تحسين cost optimization
4. 🟢 **Low Priority:** إضافة timeout للـ Vision API
5. 🟢 **Low Priority:** إضافة logging/metrics

---

**التكامل يعمل لكن يحتاج تحسينات! 🚀**
