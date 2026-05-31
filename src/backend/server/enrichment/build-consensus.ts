// src/backend/server/enrichment/build-consensus.ts
import OpenAI from 'openai';

export const MIN_REVIEWS_FOR_CONSENSUS = 3;

export interface ConsensusReviewInput {
  stars: number;
  text: string;
}

export interface ConsensusRecord {
  basedOnCount: number;
}

/** Pure: prompt for a short, verified-framed consensus paragraph. */
export function buildConsensusPrompt(productName: string, reviews: ConsensusReviewInput[]): string {
  const lines = reviews
    .filter((r) => r.text?.trim())
    .map((r) => `(${r.stars}★) ${r.text.trim()}`)
    .join('\n');
  return [
    `لخّص إجماع المشترين الموثقين للمنتج "${productName}" في فقرة عربية واحدة (٢-٣ جمل).`,
    'ابدأ بصيغة مثل "يُجمع المشترون الموثقون أن...". اعتمد فقط على التقييمات أدناه ولا تخترع تفاصيل.',
    'لا تذكر أسماء عملاء، ولا تقتبس حرفيًا. أعد نص الفقرة فقط دون عناوين أو تنسيق.',
    'التقييمات:',
    lines,
  ].join('\n');
}

/** Pure: decide whether to (re)generate. Skips below threshold; regenerates on >=20% growth. */
export function shouldRegenerate(existing: ConsensusRecord | null, currentCount: number): boolean {
  if (currentCount < MIN_REVIEWS_FOR_CONSENSUS) return false;
  if (!existing) return true;
  if (existing.basedOnCount <= 0) return true;
  return (currentCount - existing.basedOnCount) / existing.basedOnCount >= 0.2;
}

/** Calls OpenAI to produce the consensus paragraph. Returns null on failure/empty. */
export async function generateConsensusText(
  productName: string,
  reviews: ConsensusReviewInput[],
): Promise<string | null> {
  const usable = reviews.filter((r) => r.text?.trim());
  if (usable.length < MIN_REVIEWS_FOR_CONSENSUS || !process.env.OPENAI_API_KEY) return null;

  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), 15000);

    const completion = await client.chat.completions.create({
      model,
      temperature: 0.3,
      max_tokens: 220,
      messages: [
        { role: 'system', content: 'أنت تكتب خلاصة موجزة لإجماع المشترين بالعربية بأسلوب محايد وموثوق.' },
        { role: 'user', content: buildConsensusPrompt(productName, usable) },
      ],
    }, { signal: controller.signal });

    const text = completion.choices[0]?.message?.content?.trim();
    return text && text.length > 0 ? text : null;
  } catch (e) {
    console.error('[generateConsensusText] failed:', e instanceof Error ? e.message : String(e));
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
