// دمج قواعد سريعة + OpenAI Moderation API + فحص صور (Vision)
// يتعامل مع النص وحده أو النص + قائمة صور CDN (Uploadcare)

import OpenAI from "openai";
// أنواع الرسائل/الأجزاء المتوافقة مع chat.completions
import type {
  ChatCompletionMessageParam,
  ChatCompletionContentPart,
} from "openai/resources/chat/completions";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ===== Types =====
export type Category = "abuse" | "spam" | "irrelevant" | "policy";

export type ModerationVerdict =
  | { allowed: true; reasons?: string[] }
  | { allowed: false; reasons: string[]; category: Category };

// ===== Rules & Consts =====
const BAD_WORDS = ["شتيمة1", "شتيمة2", "قذف", "عنصرية", "اباحي", "تهديد"]; // حدّث القائمة
const MAX_LEN = 3000;
const UCARE = /^https:\/\/ucarecdn\.com\//i;
const FIREBASE_STORAGE = /^https:\/\/firebasestorage\.googleapis\.com\//i;

// ===== Quick Heuristics =====
function quickHeuristics(
  text: string
): { ok: boolean; cat?: Category; reason?: string } {
  const clean = text.slice(0, MAX_LEN);
  const lc = clean.toLowerCase();

  if (BAD_WORDS.some((w) => lc.includes(w))) {
    return { ok: false, cat: "abuse", reason: "bad_words" };
  }
  const urls = clean.match(/https?:\/\/\S+/gi) || [];
  if (urls.length > 3) return { ok: false, cat: "spam", reason: "too_many_links" };
  if (clean.trim().length < 2) return { ok: false, cat: "irrelevant", reason: "too_short" };

  return { ok: true };
}

// ===== OpenAI Text Moderation =====
type ModerationsAPIResult = {
  results?: Array<{
    flagged?: boolean;
    categories?: Record<string, boolean>;
  }>;
};

async function checkTextWithModerationApi(
  text: string
): Promise<{ flagged: boolean; reasons: string[] }> {
  try {
    const resp = await client.moderations.create({
      model: "omni-moderation-latest",
      input: text,
    });

    const m = resp as unknown as ModerationsAPIResult;
    const r = m.results?.[0];
    const flagged = Boolean(r?.flagged);
    const cats = r?.categories || {};
    const reasons = Object.keys(cats).filter((k) => cats[k]);
    return { flagged, reasons };
  } catch {
    return { flagged: false, reasons: [] };
  }
}

// ===== Vision on Images (GPT-4o family) =====
async function checkImagesWithVision(
  imageUrls: string[]
): Promise<{ flagged: boolean; reasons: string[] }> {
  const urls = (imageUrls || []).filter((u) => UCARE.test(u) || FIREBASE_STORAGE.test(u)).slice(0, 4);
  if (!urls.length) return { flagged: false, reasons: [] };

  try {
    // محتوى المستخدم: نص إرشادي + صور
    const userParts: ChatCompletionContentPart[] = [
      {
        type: "text",
        text:
          "حلّل الصور التالية واخبرني إن كان فيها: إباحية/عري صريح، عنف بشع، إيذاء، رموز كراهية، أو نص مسيء ظاهر بالصورة. " +
          "أعطني تلخيصًا قصيرًا باللغة الإنجليزية أو العربية يتضمن الكلمات المفتاحية المكتشفة.",
      },
      ...urls.map<ChatCompletionContentPart>((u) => ({
        type: "image_url",
        image_url: { url: u },
      })),
    ];

    const messages: ChatCompletionMessageParam[] = [
      {
        role: "system",
        content:
          "You are a strict safety image moderator. Return a short summary including keywords found (e.g., nudity, violence, hate, harassment).",
      },
      { role: "user", content: userParts },
    ];

    const resp = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      temperature: 0,
    });

    const out = String(resp.choices?.[0]?.message?.content || "").toLowerCase();

    const flagged =
      /\b(nudity|sexual|porn|explicit|gore|violence|hate|harassment|abuse|illegal)\b/.test(out) ||
      /\b(مخل|إباح|عري|عنيف|كراهية|إساءة)\b/.test(out);

    const reasons: string[] = [];
    if (/(?:\bnudity\b|sexual|porn|explicit|عري|إباح)/i.test(out)) reasons.push("image_nudity");
    if (/(?:\bviolence\b|gore|عنيف)/i.test(out)) reasons.push("image_violence");
    if (/(?:\bhate\b|harassment|abuse|كراهية|إساءة)/i.test(out)) reasons.push("image_abuse");

    return { flagged, reasons: reasons.length ? reasons : flagged ? ["image_policy"] : [] };
  } catch {
    return { flagged: false, reasons: [] };
  }
}

// ===== Unified API =====
/**
 * واجهة موحَّدة تُرجع allow/reject مع سبب.
 * images: روابط Uploadcare (اختياري)
 */
export async function checkReviewModeration(
  text: string,
  images?: string[]
): Promise<ModerationVerdict> {
  const t = String(text || "").slice(0, MAX_LEN);

  // 0) قواعد سريعة
  const quick = quickHeuristics(t);
  if (!quick.ok) return { allowed: false, reasons: [quick.reason || "rule"], category: quick.cat! };

  // 1) OpenAI Text Moderation
  const textMod = await checkTextWithModerationApi(t);
  if (textMod.flagged) {
    return {
      allowed: false,
      reasons: textMod.reasons.length ? textMod.reasons : ["policy"],
      category: "policy",
    };
  }

  // 2) Vision على الصور (لو موجودة)
  const imgMod = await checkImagesWithVision(images || []);
  if (imgMod.flagged) {
    return {
      allowed: false,
      reasons: imgMod.reasons.length ? imgMod.reasons : ["image_policy"],
      category: "policy",
    };
  }

  // 3) مسموح
  return { allowed: true };
}

export default checkReviewModeration;
