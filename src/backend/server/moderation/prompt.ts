import OpenAI from 'openai';

export type PromptDecision = {
  flagged: boolean;
  reasons: string[];
  categories: {
    hate?: boolean; harassment?: boolean; sexual?: boolean; self_harm?: boolean;
    profanity?: boolean; violence?: boolean; spam?: boolean;
  };
  confidence?: number;
  model: string;
  timedOut?: boolean;
};

if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY environment variable is required for moderation');
}
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

function safeParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export async function moderateByPrompt(text: string): Promise<PromptDecision> {
  const content = (text || '').trim();
  const base: PromptDecision = {
    flagged: false, reasons: [], categories: {}, confidence: 0, model: 'gpt-4o-mini',
  };
  if (!content) return base;

  const systemPrompt = `
أنت مُصنّف محتوى عربي/إنجليزي. أعد **JSON فقط** (بدون أي نص إضافي) بالشكل التالي:
{
  "flagged": boolean,
  "reasons": string[],   // بالعربية وباقتضاب
  "categories": { "hate"?: boolean, "harassment"?: boolean, "sexual"?: boolean, "self_harm"?: boolean, "profanity"?: boolean, "violence"?: boolean, "spam"?: boolean },
  "confidence": number   // من 0 إلى 1
}
ضع flagged=true لو النص يحتوي إساءة/بذاءة صارخة/كراهية/تحرّش/محتوى جنسي صريح/عنف/إيذاء نفس/سبّ مباشر/تهديد. لو نقد محترم أو لهجة عامية غير مهينة → flagged=false.
`.trim();

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const resp = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `النص:\n${content}` },
        ],
      });

      const out = resp.choices?.[0]?.message?.content ?? '';
      const parsed = safeParse<PromptDecision>(out);
      if (parsed && typeof parsed.flagged === 'boolean' && parsed.categories) {
        return {
          flagged: parsed.flagged,
          reasons: Array.isArray(parsed.reasons) ? parsed.reasons : [],
          categories: parsed.categories || {},
          confidence: typeof parsed.confidence === 'number' ? parsed.confidence : undefined,
          model: resp.model ?? base.model,
        };
      }

      // لو رجّع نص غير JSON، حاول برومبت أقصر
      if (attempt === 0) {
        await sleep(250);
        continue;
      }
      return { ...base, timedOut: true };
    } catch (e: unknown) {
      // خطأ عابر (429/5xx) جرّب مرة كمان
      const status = (e as { status?: number })?.status;
      if (attempt === 0 && typeof status === 'number' && (status === 429 || status >= 500)) {
        await sleep(300 + Math.random() * 300);
        continue;
      }
      return { ...base, timedOut: true };
    }
  }

  return { ...base, timedOut: true };
}
