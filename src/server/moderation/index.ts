// src/server/moderation/index.ts
import { Filter } from "bad-words";
import { moderateByApi, ApiModerationDecision } from "./openai-moderation";
import { moderateByPrompt, PromptDecision } from "./prompt";
import { checkReviewModeration } from "./checkReview";

/* ======================
   Profanity Filter (واحد فقط)
====================== */
const badWordsFilter = new Filter({ placeHolder: "*" });

/* ======================
   Types
====================== */

export type ModerationInput = {
  text: string;
  images?: string[];
  stars?: number;
  costSaving?: boolean;
};

export type ModerationResult = {
  ok: boolean;
  reason?: string;
  flags?: string[];
  categories?: Record<string, boolean>;
  model?: string;
  score?: number;
  needsManualCheck?: boolean;
  sources?: {
    api?: ApiModerationDecision;
    prompt?: PromptDecision;
  };
};

/* ======================
   Utilities
====================== */
function unionCategories(
  a: Record<string, boolean> = {},
  b: Record<string, boolean> = {}
): Record<string, boolean> {
  const keys = new Set<string>([...Object.keys(a), ...Object.keys(b)]);
  const out: Record<string, boolean> = {};
  keys.forEach((k) => (out[k] = Boolean(a[k] || b[k])));
  return out;
}

/* ======================
   Hybrid Moderator
====================== */
export type HybridDecision = {
  flagged: boolean;
  reasons: string[];
  categories: Record<string, boolean>;
  confidence?: number;
  model: "hybrid(api+prompt)";
  needsManualCheck?: boolean;
  sources: {
    api?: ApiModerationDecision;
    prompt?: PromptDecision;
  };
};

async function moderateHybrid(
  text: string,
  opts?: { costSaving?: boolean }
): Promise<HybridDecision> {
  const costSaving = Boolean(opts?.costSaving);

  const api = await moderateByApi(text);

  let prompt: PromptDecision | undefined;
  const needPrompt = !costSaving || api.flagged || api.timedOut;
  if (needPrompt) {
    prompt = await moderateByPrompt(text);
  }

  const flagged = Boolean(api.flagged || (prompt?.flagged ?? false));
  const reasons = prompt?.reasons?.length ? prompt.reasons : [];
  const categories = unionCategories(api.categories || {}, prompt?.categories || {});
  const needsManualCheck = Boolean(api.timedOut || (prompt?.timedOut ?? false));
  const confidence = prompt?.confidence;

  return {
    flagged,
    reasons,
    categories,
    confidence,
    model: "hybrid(api+prompt)",
    needsManualCheck,
    sources: { api, prompt },
  };
}

/* ======================
   Public Entry
====================== */
export async function moderateReview(input: ModerationInput): Promise<ModerationResult> {
  const text = (input.text || "").trim();
  const flags: string[] = [];

  // 1) قواعد سريعة
  if (text.length > 4000) {
    return { ok: false, reason: "too_long", flags: ["too_long"] };
  }
  if (/(https?:\/\/|www\.)/i.test(text)) {
    flags.push("has_links");
  }
  if (badWordsFilter.isProfane(text)) {
    flags.push("bad_words");
  }

  // 2) فحص الصور أولاً (إذا كانت موجودة) - Vision API
  if (input.images && input.images.length > 0) {
    try {
      const visionResult = await checkReviewModeration(text, input.images);
      if (!visionResult.allowed) {
        return {
          ok: false,
          reason: visionResult.reasons?.[0] || "image_policy",
          flags: Array.from(new Set([...(visionResult.reasons || []), ...flags])),
          categories: {},
          model: "vision",
          needsManualCheck: false,
        };
      }
    } catch (e) {
      console.error("[moderation] Vision API failed:", e);
      // Continue with text moderation even if vision fails
      flags.push("vision_error");
    }
  }

  // 3) Hybrid AI (Text Moderation)
  const h = await moderateHybrid(text, { costSaving: input.costSaving });

  if (h.flagged) {
    return {
      ok: false,
      reason: h.reasons[0] || "ai_reject",
      flags: Array.from(new Set([...(h.reasons || []), ...flags])),
      categories: h.categories,
      model: h.model,
      score: h.confidence,
      needsManualCheck: h.needsManualCheck,
      sources: h.sources,
    };
  }

  // 4) مقبول
  return {
    ok: true,
    flags,
    categories: h.categories,
    model: h.model,
    score: h.confidence,
    needsManualCheck: h.needsManualCheck,
    sources: h.sources,
  };
}
