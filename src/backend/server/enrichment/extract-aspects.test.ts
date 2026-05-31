// src/backend/server/enrichment/extract-aspects.test.ts
import { describe, it, expect } from 'vitest';
import { buildExtractionPrompt, parseExtractionResponse } from './extract-aspects';

describe('buildExtractionPrompt', () => {
  it('includes the review text and star rating', () => {
    const p = buildExtractionPrompt('الكريم ممتاز وناسب بشرتي الجافة', 5);
    expect(p).toContain('الكريم ممتاز');
    expect(p).toContain('5');
  });
});

describe('parseExtractionResponse', () => {
  it('parses a valid JSON payload into a normalized enrichment object', () => {
    const raw = JSON.stringify({
      aspects: [{ name: 'بشرة جافة', sentiment: 'positive', quote: 'ناسب بشرتي الجافة' }],
      topics: ['ترطيب', 'جودة'],
      sentiment: 'positive',
    });
    const out = parseExtractionResponse(raw);
    expect(out).not.toBeNull();
    expect(out!.aspects[0].name).toBe('بشرة جافة');
    expect(out!.sentiment).toBe('positive');
    expect(out!.topics).toEqual(['ترطيب', 'جودة']);
  });

  it('returns null on malformed JSON instead of throwing', () => {
    expect(parseExtractionResponse('not json')).toBeNull();
  });

  it('returns null when sentiment is outside the allowed enum', () => {
    const raw = JSON.stringify({ aspects: [], topics: [], sentiment: 'angry' });
    expect(parseExtractionResponse(raw)).toBeNull();
  });
});

import { extractAspects } from './extract-aspects';

describe('extractAspects', () => {
  it('returns null for empty text without calling the model', async () => {
    const out = await extractAspects({ text: '   ', stars: 5 });
    expect(out).toBeNull();
  });
});
