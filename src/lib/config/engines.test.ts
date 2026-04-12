import { describe, expect, it } from 'vitest';
import { DEFAULT_ENGINE_INDEX, ENGINES } from './engines';

describe('ENGINES', () => {
	it('exposes three engines', () => {
		expect(ENGINES).toHaveLength(3);
	});

	it('has unique ids', () => {
		const ids = ENGINES.map((e) => e.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('has a sensible default', () => {
		expect(DEFAULT_ENGINE_INDEX).toBeGreaterThanOrEqual(0);
		expect(DEFAULT_ENGINE_INDEX).toBeLessThan(ENGINES.length);
	});

	it('every engine builds an https:// URL', () => {
		for (const engine of ENGINES) {
			const url = engine.searchUrl('hello');
			expect(url.startsWith('https://')).toBe(true);
		}
	});

	it('URL-encodes special characters in the query', () => {
		for (const engine of ENGINES) {
			const url = engine.searchUrl('a b&c=d');
			expect(url).toContain(encodeURIComponent('a b&c=d'));
			expect(url).not.toContain('a b&c=d');
		}
	});

	it('escapes characters that would break URL parsing', () => {
		for (const engine of ENGINES) {
			const url = engine.searchUrl('<script>alert(1)</script>');
			const parsed = new URL(url);
			expect(parsed.protocol).toBe('https:');
			expect(parsed.searchParams.get('q')).toBe('<script>alert(1)</script>');
		}
	});
});
