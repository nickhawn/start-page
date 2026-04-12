import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_ENTRIES, STORAGE_KEY, type HistoryFile } from '$lib/utils/historyStorage';
import { _resetAvailabilityCacheForTests } from '$lib/utils/historyStorage';
import { _resetForTests, historyState } from './history.svelte';

const DAY_MS = 86_400_000;

function createMemoryStorage(): Storage {
	const store = new Map<string, string>();
	return {
		get length() {
			return store.size;
		},
		clear: () => store.clear(),
		getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
		key: (i: number) => Array.from(store.keys())[i] ?? null,
		removeItem: (k: string) => {
			store.delete(k);
		},
		setItem: (k: string, v: string) => {
			store.set(k, v);
		}
	};
}

describe('historyState', () => {
	beforeEach(() => {
		vi.stubGlobal('localStorage', createMemoryStorage());
		_resetAvailabilityCacheForTests();
		_resetForTests();
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-04-01T00:00:00Z'));
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
		_resetForTests();
		_resetAvailabilityCacheForTests();
	});

	describe('record', () => {
		it('creates a probationary entry on first use', () => {
			historyState.record('hello', 'query');
			expect(historyState.size).toBe(1);
			const e = historyState.entries[0];
			expect(e.confirmed).toBe(false);
			expect(e.count).toBe(1);
		});

		it('hides probationary entries from match()', () => {
			historyState.record('hello', 'query');
			expect(historyState.match('hello')).toEqual([]);
		});

		it('promotes to confirmed on the second record of the same value', () => {
			historyState.record('hello', 'query');
			historyState.record('hello', 'query');
			const e = historyState.entries[0];
			expect(e.confirmed).toBe(true);
			expect(e.count).toBe(2);
			expect(historyState.match('hello')).toHaveLength(1);
		});

		it('collapses near-duplicates (prefix + levenshtein ≤ 2)', () => {
			historyState.record('github', 'query');
			historyState.record('githubb', 'query');
			expect(historyState.size).toBe(1);
			const e = historyState.entries[0];
			expect(e.count).toBe(2);
			expect(e.value).toBe('githubb');
		});

		it('preserves the id when a near-duplicate is merged', () => {
			historyState.record('github', 'query');
			const id = historyState.entries[0].id;
			historyState.record('githubb', 'query');
			expect(historyState.entries[0].id).toBe(id);
			expect(historyState.entries[0].value).toBe('githubb');
			expect(historyState.entries[0].count).toBe(2);
		});

		it('is a no-op when paused', () => {
			historyState.setPaused(true);
			historyState.record('hello', 'query');
			expect(historyState.size).toBe(0);
		});

		it('does not cross-collapse between query and url kinds', () => {
			historyState.record('github.com', 'url');
			historyState.record('github.com', 'query');
			expect(historyState.size).toBe(2);
		});

		it('ignores empty input', () => {
			historyState.record('   ', 'query');
			expect(historyState.size).toBe(0);
		});

		it('persists to localStorage synchronously', () => {
			historyState.record('hello', 'query');
			const raw = localStorage.getItem(STORAGE_KEY);
			expect(raw).not.toBeNull();
			const parsed = JSON.parse(raw!) as HistoryFile;
			expect(parsed.entries).toHaveLength(1);
			expect(parsed.entries[0].value).toBe('hello');
		});
	});

	describe('confirm', () => {
		it('flips a probationary entry to confirmed without incrementing count', () => {
			historyState.record('hello', 'query');
			const id = historyState.entries[0].id;
			historyState.confirm(id);
			expect(historyState.entries[0].confirmed).toBe(true);
			expect(historyState.entries[0].count).toBe(1);
		});

		it('is a no-op for an unknown id', () => {
			historyState.record('hello', 'query');
			historyState.confirm('query:nope');
			expect(historyState.entries[0].confirmed).toBe(false);
		});
	});

	describe('remove', () => {
		it('removes exactly the matching entry', () => {
			historyState.record('one', 'query');
			historyState.record('two', 'query');
			const victim = historyState.entries[0].id;
			historyState.remove(victim);
			expect(historyState.size).toBe(1);
			expect(historyState.entries[0].value).toBe('two');
		});
	});

	describe('clear', () => {
		it('empties entries but preserves the paused flag', () => {
			historyState.setPaused(true);
			historyState.setPaused(false);
			historyState.setPaused(true);
			historyState.record('x', 'query'); // ignored
			historyState.setPaused(false);
			historyState.record('y', 'query');
			historyState.setPaused(true);
			historyState.clear();
			expect(historyState.size).toBe(0);
			expect(historyState.paused).toBe(true);
		});
	});

	describe('setPaused', () => {
		it('persists the paused flag', () => {
			historyState.setPaused(true);
			const raw = localStorage.getItem(STORAGE_KEY);
			expect(raw).not.toBeNull();
			const parsed = JSON.parse(raw!) as HistoryFile;
			expect(parsed.paused).toBe(true);
		});

		it('is a no-op when the value is unchanged', () => {
			historyState.setPaused(true);
			localStorage.removeItem(STORAGE_KEY);
			historyState.setPaused(true);
			expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
		});
	});

	describe('capacity cap', () => {
		// Fixed-width names so no two values are prefixes of each other — otherwise
		// near-duplicate collapse would merge them and the cap would never trip.
		const name = (i: number) => `item-${i.toString().padStart(2, '0')}`;

		it('evicts the lowest-rank entry once MAX_ENTRIES is exceeded', () => {
			for (let i = 0; i < MAX_ENTRIES; i++) {
				historyState.record(name(i), 'query');
				historyState.record(name(i), 'query');
			}
			expect(historyState.size).toBe(MAX_ENTRIES);

			vi.setSystemTime(new Date(Date.now() + 40 * DAY_MS));

			for (let i = 1; i < MAX_ENTRIES; i++) {
				historyState.record(name(i), 'query');
			}

			historyState.record('newcomer-xx', 'query');
			expect(historyState.size).toBe(MAX_ENTRIES);
			expect(historyState.entries.some((e) => e.value === name(0))).toBe(false);
			expect(historyState.entries.some((e) => e.value === 'newcomer-xx')).toBe(true);
		});

		it('does not evict the newcomer when it is the lowest-rank entry at a full cap', () => {
			for (let i = 0; i < MAX_ENTRIES; i++) {
				historyState.record(name(i), 'query');
				historyState.record(name(i), 'query');
			}
			expect(historyState.size).toBe(MAX_ENTRIES);

			historyState.record('newcomer-xx', 'query');
			expect(historyState.size).toBe(MAX_ENTRIES);
			expect(historyState.entries.some((e) => e.value === 'newcomer-xx')).toBe(true);
			const survivors = historyState.entries.filter((e) => e.value.startsWith('item-'));
			expect(survivors).toHaveLength(MAX_ENTRIES - 1);
		});
	});

	describe('hydrate', () => {
		it('loads entries and paused from localStorage', () => {
			const file: HistoryFile = {
				version: 1,
				paused: true,
				entries: [
					{
						id: 'query:preload',
						value: 'preload',
						kind: 'query',
						count: 3,
						firstAt: 0,
						lastAt: 0,
						confirmed: true
					}
				]
			};
			localStorage.setItem(STORAGE_KEY, JSON.stringify(file));
			historyState.hydrate();
			expect(historyState.size).toBe(1);
			expect(historyState.paused).toBe(true);
		});

		it('is idempotent', () => {
			historyState.hydrate();
			historyState.record('once', 'query');
			historyState.hydrate(); // should not reset entries
			expect(historyState.size).toBe(1);
		});
	});

	describe('prune', () => {
		it('removes entries whose rank has decayed to ≤ 0', () => {
			historyState.record('stay', 'query');
			historyState.record('stay', 'query'); // count=2, confirmed
			historyState.record('go', 'query'); // count=1
			expect(historyState.size).toBe(2);

			// Advance past the count=1 decay horizon
			vi.setSystemTime(new Date(Date.now() + 100 * DAY_MS));
			historyState.prune();
			expect(historyState.entries.some((e) => e.value === 'go')).toBe(false);
		});
	});
});
