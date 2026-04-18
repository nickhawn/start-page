import { describe, expect, it } from 'vitest';
import type { HistoryEntry } from './historyStorage';
import {
	DECAY_DAYS,
	isNearDuplicate,
	levenshteinBounded,
	matchEntries,
	normalize,
	rank
} from './historyRank';

const DAY_MS = 86_400_000;

function entry(value: string, overrides: Partial<HistoryEntry> = {}): HistoryEntry {
	return {
		id: `query:${value}`,
		value,
		kind: 'query',
		count: 2,
		firstAt: 0,
		lastAt: 0,
		confirmed: true,
		...overrides
	};
}

describe('normalize', () => {
	it('lowercases', () => {
		expect(normalize('HeLLo')).toBe('hello');
	});

	it('trims leading and trailing whitespace', () => {
		expect(normalize('   hi  ')).toBe('hi');
	});

	it('collapses internal whitespace', () => {
		expect(normalize('foo   bar\tbaz')).toBe('foo bar baz');
	});

	it('returns empty string for whitespace-only input', () => {
		expect(normalize('   ')).toBe('');
	});
});

describe('levenshteinBounded', () => {
	it('returns 0 for identical strings', () => {
		expect(levenshteinBounded('abc', 'abc', 5)).toBe(0);
	});

	it('returns the edit distance when under cap', () => {
		expect(levenshteinBounded('kitten', 'sitting', 5)).toBe(3);
	});

	it('early-bails with cap+1 when length difference exceeds cap', () => {
		expect(levenshteinBounded('a', 'abcdef', 2)).toBe(3);
	});

	it('early-bails with cap+1 when row minimum exceeds cap', () => {
		expect(levenshteinBounded('abcdef', 'zzzzzz', 2)).toBe(3);
	});

	it('handles empty strings', () => {
		expect(levenshteinBounded('', 'abc', 5)).toBe(3);
		expect(levenshteinBounded('abc', '', 5)).toBe(3);
		expect(levenshteinBounded('', '', 5)).toBe(0);
	});
});

describe('isNearDuplicate', () => {
	it('is true for identical normalized strings', () => {
		expect(isNearDuplicate('Hello', 'hello')).toBe(true);
	});

	it('is true for prefix + edit distance ≤ 2', () => {
		expect(isNearDuplicate('svelte', 'svelt')).toBe(true);
		expect(isNearDuplicate('github', 'githubb')).toBe(true);
	});

	it('is false when neither is a prefix of the other', () => {
		expect(isNearDuplicate('foo', 'bar')).toBe(false);
	});

	it('is false for unrelated same-length words', () => {
		expect(isNearDuplicate('cat', 'dog')).toBe(false);
	});

	it('is false when prefix holds but edit distance exceeds cap', () => {
		expect(isNearDuplicate('abcdef', 'abc')).toBe(false);
	});
});

describe('rank', () => {
	it('increases with count', () => {
		const a = entry('x', { count: 1, lastAt: 1_000_000 });
		const b = entry('x', { count: 5, lastAt: 1_000_000 });
		expect(rank(b, 1_000_000)).toBeGreaterThan(rank(a, 1_000_000));
	});

	it('decreases as the entry ages', () => {
		const e = entry('x', { count: 3, lastAt: 0 });
		const young = rank(e, 0);
		const old = rank(e, 10 * DAY_MS);
		expect(young).toBeGreaterThan(old);
	});

	it('drops below zero past the decay horizon for a count-1 entry', () => {
		const e = entry('x', { count: 1, lastAt: 0 });
		expect(rank(e, (DECAY_DAYS + 1) * DAY_MS)).toBeLessThan(0);
	});
});

describe('matchEntries', () => {
	it('returns an empty array for an empty query', () => {
		const entries = [entry('hello')];
		expect(matchEntries('', entries, 0)).toEqual([]);
	});

	it('returns an empty array for a whitespace-only query', () => {
		const entries = [entry('hello')];
		expect(matchEntries('   ', entries, 0)).toEqual([]);
	});

	it('hides unconfirmed (probationary) entries', () => {
		const entries = [entry('hello', { confirmed: false })];
		expect(matchEntries('hello', entries, 0)).toEqual([]);
	});

	it('hides entries whose rank has decayed to ≤ 0', () => {
		const stale = entry('hello', { count: 1, lastAt: 0 });
		const now = 100 * DAY_MS;
		expect(matchEntries('hello', [stale], now)).toEqual([]);
	});

	it('matches case-insensitively', () => {
		const entries = [entry('Hello World', { count: 3, lastAt: 0 })];
		const result = matchEntries('hello', entries, 0);
		expect(result).toHaveLength(1);
		expect(result[0].value).toBe('Hello World');
	});

	it('matches substrings, not just prefixes', () => {
		const entries = [entry('how to use svelte', { count: 3, lastAt: 0 })];
		const result = matchEntries('svelte', entries, 0);
		expect(result).toHaveLength(1);
	});

	it('respects the limit parameter', () => {
		const entries = [
			entry('foo one', { count: 3, lastAt: 0 }),
			entry('foo two', { count: 3, lastAt: 0 }),
			entry('foo three', { count: 3, lastAt: 0 }),
			entry('foo four', { count: 3, lastAt: 0 })
		];
		const result = matchEntries('foo', entries, 0, 2);
		expect(result).toHaveLength(2);
	});

	it('sorts by score descending', () => {
		const entries = [
			entry('foo weak', { count: 2, lastAt: 0 }),
			entry('foo strong', { count: 10, lastAt: 0 })
		];
		const result = matchEntries('foo', entries, 0);
		expect(result[0].value).toBe('foo strong');
		expect(result[1].value).toBe('foo weak');
	});

	it('prefix matches score higher than pure substring matches of equal count', () => {
		const entries = [
			entry('not foo match', { count: 3, lastAt: 0 }),
			entry('foo prefix match', { count: 3, lastAt: 0 })
		];
		const result = matchEntries('foo', entries, 0);
		expect(result[0].value).toBe('foo prefix match');
	});

	it('matches url entries against their url-normalized form (strips protocol/www)', () => {
		const entries = [
			entry('https://staging.asi1.ai', { kind: 'url', count: 3, lastAt: 0 }),
			entry('www.theverge.com', { kind: 'url', count: 3, lastAt: 0 })
		];
		expect(matchEntries('staging', entries, 0)).toHaveLength(1);
		expect(matchEntries('theverge', entries, 0)).toHaveLength(1);
	});

	it('matches url entries against raw value when protocol is absent', () => {
		const entries = [entry('staging.asi1.ai', { kind: 'url', count: 3, lastAt: 0 })];
		const result = matchEntries('staging', entries, 0);
		expect(result).toHaveLength(1);
		expect(result[0].value).toBe('staging.asi1.ai');
	});

	it('ranks a hostname-prefix url match above a query-kind entry with higher count', () => {
		const entries = [
			entry('thev', { kind: 'query', count: 7, lastAt: 0 }),
			entry('theverge.com', { kind: 'url', count: 5, lastAt: 0 })
		];
		const result = matchEntries('thev', entries, 0);
		expect(result[0].value).toBe('theverge.com');
		expect(result[1].value).toBe('thev');
	});

	it('does not apply the hostname-prefix boost to query-kind entries', () => {
		const entries = [
			entry('foo', { kind: 'query', count: 3, lastAt: 0 }),
			entry('foobar', { kind: 'query', count: 3, lastAt: 0 })
		];
		const result = matchEntries('foo', entries, 0);
		expect(result.map((r) => r.value).sort()).toEqual(['foo', 'foobar']);
	});
});
