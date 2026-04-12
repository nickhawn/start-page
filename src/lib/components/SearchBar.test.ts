import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';

vi.mock('$lib/utils/autocomplete', () => ({
	fetchSuggestions: vi.fn(async () => [] as string[])
}));

import { fetchSuggestions } from '$lib/utils/autocomplete';
import { _resetForTests, historyState } from '$lib/stores/history.svelte';
import {
	_resetAvailabilityCacheForTests,
	STORAGE_KEY,
	type HistoryFile
} from '$lib/utils/historyStorage';
import { engineState } from '$lib/stores/engine.svelte';
import { DEFAULT_ENGINE_INDEX, ENGINES } from '$lib/config/engines';
import SearchBar from './SearchBar.svelte';

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

let navigatedTo: string | null = null;
let originalLocation: Location;

async function settle() {
	await tick();
	await tick();
}

function getInput(): HTMLInputElement {
	const input = document.querySelector('input.search-input') as HTMLInputElement | null;
	if (!input) throw new Error('search input not found');
	return input;
}

async function typeInto(input: HTMLInputElement, value: string) {
	input.value = value;
	await fireEvent.input(input, { target: { value } });
	await settle();
}

function preloadHistory(entries: HistoryFile['entries'], paused = false) {
	const file: HistoryFile = { version: 1, paused, entries };
	localStorage.setItem(STORAGE_KEY, JSON.stringify(file));
}

function confirmedEntry(value: string, kind: 'query' | 'url' = 'query', count = 2) {
	return {
		id: `${kind}:${value.toLowerCase()}`,
		value,
		kind,
		count,
		firstAt: 0,
		lastAt: Date.now(),
		confirmed: true
	};
}

describe('SearchBar', () => {
	beforeEach(() => {
		vi.stubGlobal('localStorage', createMemoryStorage());
		_resetAvailabilityCacheForTests();
		_resetForTests();
		engineState.set(DEFAULT_ENGINE_INDEX);
		vi.mocked(fetchSuggestions).mockResolvedValue([]);

		navigatedTo = null;
		originalLocation = window.location;
		const mockLocation = {
			...originalLocation,
			get href() {
				return navigatedTo ?? 'http://localhost/';
			},
			set href(v: string) {
				navigatedTo = v;
			},
			assign: vi.fn((v: string) => {
				navigatedTo = v;
			}),
			replace: vi.fn((v: string) => {
				navigatedTo = v;
			})
		};
		Object.defineProperty(window, 'location', {
			configurable: true,
			writable: true,
			value: mockLocation
		});
	});

	afterEach(() => {
		cleanup();
		Object.defineProperty(window, 'location', {
			configurable: true,
			writable: true,
			value: originalLocation
		});
		vi.unstubAllGlobals();
		_resetForTests();
		_resetAvailabilityCacheForTests();
		engineState.set(DEFAULT_ENGINE_INDEX);
	});

	describe('mount', () => {
		it('hydrates from localStorage and focuses the input', async () => {
			preloadHistory([confirmedEntry('preloaded')]);

			render(SearchBar);
			await settle();

			expect(historyState.size).toBe(1);
			expect(document.activeElement).toBe(getInput());
		});
	});

	describe('enter navigation', () => {
		it('navigates using the typed query when the user has not arrow-navigated', async () => {
			render(SearchBar);
			await settle();

			const input = getInput();
			await typeInto(input, 'foo');
			await fireEvent.keyDown(input, { key: 'Enter' });

			expect(navigatedTo).toBe(ENGINES[DEFAULT_ENGINE_INDEX].searchUrl('foo'));
		});

		it('navigates to the highlighted history row after arrow-navigation', async () => {
			historyState.record('github', 'query');
			historyState.record('github', 'query');
			expect(historyState.entries[0].confirmed).toBe(true);

			render(SearchBar);
			await settle();

			const input = getInput();
			await typeInto(input, 'git');
			await fireEvent.keyDown(input, { key: 'ArrowDown' });
			await settle();
			await fireEvent.keyDown(input, { key: 'Enter' });

			expect(navigatedTo).toBe(ENGINES[DEFAULT_ENGINE_INDEX].searchUrl('github'));
		});
	});

	describe('keyboard shortcuts', () => {
		it('cycles the engine on Tab', async () => {
			render(SearchBar);
			await settle();

			const startIdx = engineState.index;
			await fireEvent.keyDown(getInput(), { key: 'Tab' });

			expect(engineState.index).toBe((startIdx + 1) % ENGINES.length);
			expect(navigatedTo).toBeNull();
		});

		it('closes the dropdown on first Escape and clears the query on second Escape', async () => {
			historyState.record('hello', 'query');
			historyState.record('hello', 'query');

			render(SearchBar);
			await settle();

			const input = getInput();
			await typeInto(input, 'hel');
			expect(screen.queryByText('hello')).not.toBeNull();

			await fireEvent.keyDown(input, { key: 'Escape' });
			await settle();
			expect(screen.queryByText('hello')).toBeNull();
			expect(input.value).toBe('hel');

			await fireEvent.keyDown(input, { key: 'Escape' });
			await settle();
			expect(input.value).toBe('');
		});

		it('requires two Cmd+Shift+Delete presses to clear history', async () => {
			historyState.record('one', 'query');
			historyState.record('one', 'query');
			historyState.record('two', 'query');
			historyState.record('two', 'query');
			expect(historyState.size).toBe(2);

			render(SearchBar);
			await settle();

			const input = getInput();
			await fireEvent.keyDown(input, {
				key: 'Delete',
				metaKey: true,
				shiftKey: true
			});
			await settle();
			expect(historyState.size).toBe(2);
			expect(screen.queryByText(/Press.*again to clear/i)).not.toBeNull();

			await fireEvent.keyDown(input, {
				key: 'Delete',
				metaKey: true,
				shiftKey: true
			});
			await settle();
			expect(historyState.size).toBe(0);
			expect(screen.queryByText('History cleared')).not.toBeNull();
		});

		it('removes the highlighted history row on Shift+Delete', async () => {
			historyState.record('alpha-x', 'query');
			historyState.record('alpha-x', 'query');
			historyState.record('alpha-y', 'query');
			historyState.record('alpha-y', 'query');
			expect(historyState.size).toBe(2);

			render(SearchBar);
			await settle();

			const input = getInput();
			await typeInto(input, 'alpha');
			await fireEvent.keyDown(input, { key: 'ArrowDown' });
			await settle();

			await fireEvent.keyDown(input, { key: 'Delete', shiftKey: true });
			await settle();

			expect(historyState.size).toBe(1);
			expect(navigatedTo).toBeNull();
		});
	});

	describe('selection and removal', () => {
		it('navigates and leaves the entry confirmed when a suggestion is picked', async () => {
			historyState.record('example.com', 'url');
			historyState.record('example.com', 'url');
			expect(historyState.entries[0].confirmed).toBe(true);

			render(SearchBar);
			await settle();

			const input = getInput();
			await typeInto(input, 'exa');

			const option = await screen.findByRole('option', { name: /example\.com/i });
			await fireEvent.pointerDown(option);
			await fireEvent.pointerUp(option);
			await fireEvent.click(option);
			await settle();

			expect(navigatedTo).toContain('example.com');
			expect(historyState.entries[0].confirmed).toBe(true);
		});

		it('removes the row without navigating when × is clicked', async () => {
			historyState.record('removeme', 'query');
			historyState.record('removeme', 'query');

			render(SearchBar);
			await settle();

			const input = getInput();
			await typeInto(input, 'rem');
			expect(screen.queryByText('removeme')).not.toBeNull();

			const deleteBtn = screen.getByLabelText(/remove from history/i);
			await fireEvent.click(deleteBtn);
			await settle();

			expect(historyState.size).toBe(0);
			expect(navigatedTo).toBeNull();
		});

		it('does not navigate when the picked value is no longer in the list', async () => {
			historyState.record('ghost', 'query');
			historyState.record('ghost', 'query');
			const id = historyState.entries[0].id;

			render(SearchBar);
			await settle();

			const input = getInput();
			await typeInto(input, 'gho');
			expect(screen.queryByText('ghost')).not.toBeNull();

			historyState.remove(id);
			await settle();

			const row = screen.queryByText('ghost');
			if (row) {
				await fireEvent.click(row);
				await settle();
			}

			expect(navigatedTo).toBeNull();
		});
	});
});
