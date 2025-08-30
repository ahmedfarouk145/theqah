import OpenAI from 'openai';

export type ApiModerationDecision = {
  flagged: boolean;
  categories: Record<string, boolean>;
  category_scores?: Record<string, number>;
  model: string;
  timedOut?: boolean;
};

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function withTimeout<T>(p: Promise<T>, ms = 4000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('moderation_timeout')), ms);
    p.then((v) => { clearTimeout(t); resolve(v); })
     .catch((e) => { clearTimeout(t); reject(e); });
  });
}

// تحويل آمن لأي كائن إلى Record<string, boolean>
function toRecordBool(obj: unknown): Record<string, boolean> {
  if (!obj || typeof obj !== 'object') return {};
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    out[k] = Boolean(v);
  }
  return out;
}

// تحويل آمن لأي كائن إلى Record<string, number>
function toRecordNum(obj: unknown): Record<string, number> {
  if (!obj || typeof obj !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const num = typeof v === 'number' ? v : Number(v);
    out[k] = Number.isFinite(num) ? num : 0;
  }
  return out;
}

export async function moderateByApi(text: string): Promise<ApiModerationDecision> {
  const base: ApiModerationDecision = {
    flagged: false, categories: {}, model: 'omni-moderation-latest',
  };
  const content = (text || '').trim();
  if (!content) return base;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const resp = await withTimeout(
        client.moderations.create({ model: 'omni-moderation-latest', input: content }),
        4000
      );

      const r = resp.results?.[0] as unknown;

      const flagged = Boolean((r as { flagged?: boolean } | undefined)?.flagged);
      const categories = toRecordBool((r as { categories?: unknown } | undefined)?.categories);
      const scores = toRecordNum((r as { category_scores?: unknown } | undefined)?.category_scores);

      return {
        flagged,
        categories,
        category_scores: Object.keys(scores).length ? scores : undefined,
        model: resp.model || base.model,
      };
    } catch (e: unknown) {
      const status = (e as { status?: number })?.status;
      if (attempt === 0 && typeof status === 'number' && (status === 429 || status >= 500)) {
        await new Promise((r) => setTimeout(r, 300 + Math.random() * 300));
        continue;
      }
      return { ...base, timedOut: true };
    }
  }

  return { ...base, timedOut: true };
}
