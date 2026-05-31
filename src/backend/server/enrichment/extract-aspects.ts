// src/backend/server/enrichment/extract-aspects.ts
import { z } from 'zod';

export const ASPECT_SENTIMENT = ['positive', 'neutral', 'negative'] as const;

const ExtractionSchema = z.object({
  aspects: z.array(z.object({
    name: z.string().min(1).max(60),
    sentiment: z.enum(ASPECT_SENTIMENT),
    quote: z.string().max(280).optional(),
  })).max(8),
  topics: z.array(z.string().min(1).max(40)).max(8),
  sentiment: z.enum(ASPECT_SENTIMENT),
});

export type ReviewEnrichment = z.infer<typeof ExtractionSchema>;

/** Pure: builds the Arabic extraction prompt. No network. */
export function buildExtractionPrompt(text: string, stars: number): string {
  return [
    'استخرج من نص التقييم التالي البيانات المنظمة بصيغة JSON فقط.',
    'المطلوب:',
    '- aspects: مصفوفة كائنات {name: الجانب/المشكلة, sentiment: positive|neutral|negative, quote: اقتباس قصير اختياري من النص}.',
    '- topics: كلمات مفتاحية قصيرة (٢-٨).',
    '- sentiment: المشاعر العامة positive|neutral|negative.',
    'لا تخترع معلومات غير موجودة في النص. أعد JSON صالحًا فقط دون أي شرح.',
    `التقييم بالنجوم: ${stars}`,
    `النص: ${text}`,
  ].join('\n');
}

/** Pure: validates+normalizes raw model output. Returns null on any problem. */
export function parseExtractionResponse(raw: string): ReviewEnrichment | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = ExtractionSchema.safeParse(json);
  return result.success ? result.data : null;
}
