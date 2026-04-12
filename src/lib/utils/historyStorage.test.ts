import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	_resetAvailabilityCacheForTests,
	emptyFile,
	isStorageAvailable,
	readFile,
	STORAGE_KEY,
	writeFile,
	type HistoryFile
} from './historyStorage';

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

function sampleFile(): HistoryFile {
	return {
		version: 1,
		paused: false,
		entries: [
			{
				id: 'query:hello',
				value: 'hello',
				kind: 'query',
				count: 2,
				firstAt: 1_000,
				lastAt: 2_000,
				confirmed: true
			},
			{
				id: 'url:example.com',
				value: 'example.com',
				kind: 'url',
				count: 5,
				firstAt: 500,
				lastAt: 3_000,
				confirmed: true
			}
		]
	};
}

describe('historyStorage', () => {
	beforeEach(() => {
		vi.stubGlobal('localStorage', createMemoryStorage());
		_resetAvailabilityCacheForTests();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		_resetAvailabilityCacheForTests();
	});

	describe('emptyFile', () => {
		it('returns version 1, paused false, empty entries', () => {
			expect(emptyFile()).toEqual({ version: 1, paused: false, entries: [] });
		});
	});

	describe('readFile', () => {
		it('returns an empty file when localStorage has no entry', () => {
			expect(readFile()).toEqual(emptyFile());
		});

		it('returns an empty file and self-heals on malformed JSON', () => {
			localStorage.setItem(STORAGE_KEY, 'not-json{{{');
			expect(readFile()).toEqual(emptyFile());
			expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(emptyFile()));
		});

		it('returns an empty file when version is wrong', () => {
			localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, paused: false, entries: [] }));
			expect(readFile()).toEqual(emptyFile());
		});

		it('returns an empty file when entries is not an array', () => {
			localStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({ version: 1, paused: false, entries: 'nope' })
			);
			expect(readFile()).toEqual(emptyFile());
		});

		it('returns an empty file when an entry is missing required fields', () => {
			localStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({
					version: 1,
					paused: false,
					entries: [{ id: 'x', value: 'y' }]
				})
			);
			expect(readFile()).toEqual(emptyFile());
		});

		it('returns an empty file when an entry has an invalid kind', () => {
			const bad = {
				version: 1,
				paused: false,
				entries: [
					{
						id: 'x',
						value: 'y',
						kind: 'bogus',
						count: 1,
						firstAt: 0,
						lastAt: 0,
						confirmed: false
					}
				]
			};
			localStorage.setItem(STORAGE_KEY, JSON.stringify(bad));
			expect(readFile()).toEqual(emptyFile());
		});

		it('returns an empty file when getItem throws', () => {
			vi.stubGlobal('localStorage', {
				getItem: () => {
					throw new Error('blocked');
				},
				setItem: () => {},
				removeItem: () => {},
				clear: () => {},
				key: () => null,
				length: 0
			} as Storage);
			expect(readFile()).toEqual(emptyFile());
		});
	});

	describe('writeFile', () => {
		it('round-trips through readFile', () => {
			const f = sampleFile();
			writeFile(f);
			expect(readFile()).toEqual(f);
		});

		it('swallows QuotaExceededError', () => {
			vi.stubGlobal('localStorage', {
				getItem: () => null,
				setItem: () => {
					throw new DOMException('quota', 'QuotaExceededError');
				},
				removeItem: () => {},
				clear: () => {},
				key: () => null,
				length: 0
			} as Storage);
			expect(() => writeFile(sampleFile())).not.toThrow();
		});

		it('is a no-op when localStorage is unavailable', () => {
			vi.stubGlobal('localStorage', undefined);
			expect(() => writeFile(sampleFile())).not.toThrow();
		});
	});

	describe('isStorageAvailable', () => {
		it('returns true when probe succeeds', () => {
			expect(isStorageAvailable()).toBe(true);
		});

		it('returns false when setItem throws', () => {
			vi.stubGlobal('localStorage', {
				getItem: () => null,
				setItem: () => {
					throw new Error('nope');
				},
				removeItem: () => {},
				clear: () => {},
				key: () => null,
				length: 0
			} as Storage);
			_resetAvailabilityCacheForTests();
			expect(isStorageAvailable()).toBe(false);
		});

		it('memoizes the result', () => {
			const setItem = vi.fn();
			vi.stubGlobal('localStorage', {
				getItem: () => null,
				setItem,
				removeItem: () => {},
				clear: () => {},
				key: () => null,
				length: 0
			} as Storage);
			_resetAvailabilityCacheForTests();

			isStorageAvailable();
			isStorageAvailable();
			isStorageAvailable();
			expect(setItem).toHaveBeenCalledOnce();
		});
	});
});
