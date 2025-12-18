import { describe, it, expect } from 'vitest';

describe('Simple Test', () => {
    it('should pass basic math', () => {
        expect(1 + 1).toBe(2);
    });

    it('should pass string check', () => {
        expect('hello').toContain('ell');
    });
});
