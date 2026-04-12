<script lang="ts">
	import { Combobox } from 'bits-ui';
	import { onDestroy, onMount } from 'svelte';
	import EngineLogo from './EngineLogo.svelte';
	import SuggestionIcon from './SuggestionIcon.svelte';
	import { engineState } from '$lib/stores/engine.svelte';
	import { historyState } from '$lib/stores/history.svelte';
	import { fetchSuggestions } from '$lib/utils/autocomplete';
	import { debounce } from '$lib/utils/debounce';
	import { DISPLAY_LIMIT, normalize } from '$lib/utils/historyRank';
	import { isUrlLike, toUrl } from '$lib/utils/url';

	type Item = { value: string; kind: 'query' | 'url' | 'suggest'; id?: string };

	let query = $state('');
	let suggestions = $state<Item[]>([]);
	let open = $state(false);
	let inputEl = $state<HTMLInputElement | null>(null);
	let shellEl = $state<HTMLDivElement | null>(null);

	// Enter should use the typed query unless the user has deliberately
	// arrow-navigated into the dropdown. `userNavigated` tracks that
	// intent; `highlightedValue` mirrors the currently highlighted item
	// (which bits-ui auto-sets on open — we only honour it after arrow
	// navigation).
	let userNavigated = $state(false);
	let highlightedValue = $state<string | null>(null);

	// Toast + Cmd+Shift+Delete confirmation state
	let toastMessage = $state<string | null>(null);
	let toastTimer: ReturnType<typeof setTimeout> | undefined;
	let clearArmed = $state(false);
	let clearArmedTimer: ReturnType<typeof setTimeout> | undefined;

	const queryIsUrl = $derived(isUrlLike(query));
	const placeholder = $derived(
		historyState.paused ? 'Search the web… (paused)' : 'Search the web…'
	);

	let inflight: AbortController | null = null;

	function historyItems(value: string): Item[] {
		return historyState
			.match(value, DISPLAY_LIMIT)
			.map((h) => ({ value: h.value, kind: h.kind, id: h.id }));
	}

	const loadSuggestions = debounce(async (q: string) => {
		inflight?.abort();
		const controller = new AbortController();
		inflight = controller;
		const results = await fetchSuggestions(q, controller.signal);
		if (controller.signal.aborted || inflight !== controller) return;
		inflight = null;
		if (q !== query) return;

		const hist = historyItems(q);
		const histNorm = new Set(hist.map((h) => normalize(h.value)));
		const google: Item[] = results
			.filter((r) => !histNorm.has(normalize(r)))
			.map((r) => ({ value: r, kind: 'suggest' as const }));

		suggestions = [...hist, ...google];
		open = suggestions.length > 0;
	}, 180);

	function cancelInflight() {
		loadSuggestions.cancel();
		inflight?.abort();
		inflight = null;
	}

	function showToast(msg: string) {
		toastMessage = msg;
		if (toastTimer !== undefined) clearTimeout(toastTimer);
		toastTimer = setTimeout(() => {
			toastMessage = null;
			toastTimer = undefined;
		}, 2000);
	}

	function handleInput(e: Event & { currentTarget: HTMLInputElement }) {
		const value = e.currentTarget.value;
		query = value;
		userNavigated = false;
		highlightedValue = null;

		const hist = historyItems(value);
		suggestions = hist;
		open = hist.length > 0;

		if (value.trim() && !isUrlLike(value)) {
			inflight?.abort();
			loadSuggestions(value);
		} else {
			cancelInflight();
		}
	}

	function navigate(q: string, opts: { fromSuggestion?: boolean; kind?: 'query' | 'url' } = {}) {
		const trimmed = q.trim();
		if (!trimmed) return;
		const asUrl =
			opts.kind === 'url' ||
			(opts.kind === undefined && !opts.fromSuggestion && isUrlLike(trimmed));
		historyState.record(trimmed, asUrl ? 'url' : 'query');
		window.location.href = asUrl ? toUrl(trimmed) : engineState.current.searchUrl(trimmed);
	}

	function handleKeydown(e: KeyboardEvent) {
		// Cmd+Shift+Delete — clear history with two-step confirm
		if (e.metaKey && e.shiftKey && (e.key === 'Delete' || e.key === 'Backspace')) {
			e.preventDefault();
			if (clearArmed) {
				historyState.clear();
				clearArmed = false;
				if (clearArmedTimer !== undefined) {
					clearTimeout(clearArmedTimer);
					clearArmedTimer = undefined;
				}
				showToast('History cleared');
				suggestions = suggestions.filter((s) => s.kind === 'suggest');
				if (suggestions.length === 0) open = false;
			} else {
				clearArmed = true;
				showToast('Press ⌘⇧⌫ again to clear');
				if (clearArmedTimer !== undefined) clearTimeout(clearArmedTimer);
				clearArmedTimer = setTimeout(() => {
					clearArmed = false;
					clearArmedTimer = undefined;
				}, 3000);
			}
			return;
		}

		// Cmd+Shift+P — toggle pause
		if (e.metaKey && e.shiftKey && e.key.toLowerCase() === 'p') {
			e.preventDefault();
			historyState.setPaused(!historyState.paused);
			showToast(historyState.paused ? 'Recording paused' : 'Recording resumed');
			return;
		}

		// Shift+Delete / Shift+Backspace — remove the keyboard-highlighted history row
		if (
			(e.key === 'Delete' || e.key === 'Backspace') &&
			e.shiftKey &&
			!e.metaKey &&
			!e.ctrlKey &&
			!e.altKey
		) {
			if (!open || !userNavigated || highlightedValue === null) return;
			const picked = suggestions.find((s) => s.value === highlightedValue);
			if (!picked?.id || picked.kind === 'suggest') return;
			e.preventDefault();
			removeById(picked.id);
			return;
		}

		if (e.key === 'Tab') {
			e.preventDefault();
			e.stopPropagation();
			engineState.cycle();
			return;
		}

		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			userNavigated = true;
			return;
		}

		if (e.key === 'Enter') {
			e.preventDefault();
			const useHighlighted = open && userNavigated && highlightedValue !== null;
			navigate(useHighlighted ? highlightedValue! : query);
			return;
		}

		if (e.key === 'Escape') {
			cancelInflight();
			if (open) {
				open = false;
				suggestions = [];
			} else {
				query = '';
			}
			userNavigated = false;
			highlightedValue = null;
		}
	}

	function handleValueChange(value: string) {
		if (!value) return;
		const picked = suggestions.find((s) => s.value === value);
		// If the value isn't in the current list (e.g. the user just deleted it
		// via the per-entry × button), do nothing — don't navigate.
		if (!picked) return;
		if (picked.id && (picked.kind === 'query' || picked.kind === 'url')) {
			historyState.confirm(picked.id);
		}
		const kind: 'query' | 'url' = picked.kind === 'url' ? 'url' : 'query';
		navigate(value, { fromSuggestion: true, kind });
	}

	function onItemHighlight(value: string) {
		highlightedValue = value;
	}

	function onItemUnhighlight(value: string) {
		if (highlightedValue === value) highlightedValue = null;
	}

	function removeById(id: string) {
		historyState.remove(id);
		suggestions = suggestions.filter((s) => s.id !== id);
		if (suggestions.length === 0) {
			open = false;
			userNavigated = false;
			highlightedValue = null;
		}
	}

	function removeHistoryItem(item: Item, e: MouseEvent) {
		e.stopPropagation();
		if (!item.id) return;
		removeById(item.id);
	}

	function focusInput() {
		inputEl?.focus();
	}

	onMount(() => {
		historyState.hydrate();
		focusInput();
		window.addEventListener('focus', focusInput);
		document.addEventListener('visibilitychange', focusInput);
	});

	$effect(() => {
		if (inputEl) focusInput();
	});

	onDestroy(() => {
		cancelInflight();
		if (toastTimer !== undefined) clearTimeout(toastTimer);
		if (clearArmedTimer !== undefined) clearTimeout(clearArmedTimer);
		if (typeof window !== 'undefined') {
			window.removeEventListener('focus', focusInput);
			document.removeEventListener('visibilitychange', focusInput);
		}
	});
</script>

<div class="search-wrapper">
	{#if toastMessage}
		<div class="toast" role="status" aria-live="polite">{toastMessage}</div>
	{/if}

	<Combobox.Root
		type="single"
		bind:open
		inputValue={query}
		onValueChange={handleValueChange}
		allowDeselect={false}
	>
		<div class="input-shell glass-card" bind:this={shellEl}>
			<svg
				class="search-icon"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<circle cx="11" cy="11" r="7" />
				<path d="m20 20-3.5-3.5" />
			</svg>

			<Combobox.Input
				bind:ref={inputEl}
				oninput={handleInput}
				onkeydown={handleKeydown}
				{placeholder}
				autocomplete="off"
				autofocus
				spellcheck="false"
				class="search-input"
				aria-label="Search"
			/>

			<button
				type="button"
				class="engine-button"
				onclick={() => navigate(query)}
				aria-label={queryIsUrl ? 'Go' : `Search with ${engineState.current.name}`}
			>
				{#if queryIsUrl}
					<span>Go</span>
				{:else}
					<EngineLogo id={engineState.current.id} />
				{/if}
			</button>
		</div>

		{#if suggestions.length > 0}
			<Combobox.Portal>
				<Combobox.Content
					class="suggestions glass-card"
					sideOffset={8}
					align="start"
					customAnchor={shellEl}
				>
					<Combobox.Viewport class="suggestions-viewport">
						{#each suggestions as item (item.value + ':' + item.kind)}
							<Combobox.Item
								value={item.value}
								label={item.value}
								class="suggestion-item"
								onHighlight={() => onItemHighlight(item.value)}
								onUnhighlight={() => onItemUnhighlight(item.value)}
							>
								{#snippet children({ highlighted })}
									<SuggestionIcon kind={item.kind} {highlighted} />
									<span class="item-label">{item.value}</span>
									{#if item.kind !== 'suggest' && item.id}
										<button
											type="button"
											class="item-delete"
											aria-label="Remove from history (Shift+Delete)"
											tabindex={-1}
											onpointerdown={(ev) => {
												ev.preventDefault();
												ev.stopPropagation();
											}}
											onpointerup={(ev) => {
												ev.preventDefault();
												ev.stopPropagation();
											}}
											onmousedown={(ev) => {
												ev.preventDefault();
												ev.stopPropagation();
											}}
											onmouseup={(ev) => {
												ev.preventDefault();
												ev.stopPropagation();
											}}
											onclick={(ev) => {
												ev.preventDefault();
												ev.stopPropagation();
												removeHistoryItem(item, ev);
											}}
										>
											×
										</button>
									{/if}
								{/snippet}
							</Combobox.Item>
						{/each}
					</Combobox.Viewport>
				</Combobox.Content>
			</Combobox.Portal>
		{/if}
	</Combobox.Root>
</div>

<style>
	.search-wrapper {
		width: 100%;
		max-width: 600px;
		display: flex;
		flex-direction: column;
		position: relative;
	}

	.toast {
		position: absolute;
		bottom: calc(100% + 0.75rem);
		left: 50%;
		transform: translateX(-50%);
		padding: 0.5rem 0.875rem;
		border-radius: var(--radius-pill);
		background: var(--color-bg-surface);
		border: 1px solid var(--color-border);
		box-shadow: var(--shadow-card);
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--color-text-secondary);
		white-space: nowrap;
		pointer-events: none;
		animation: toast-in var(--duration-base) var(--ease-out-soft);
	}

	@keyframes toast-in {
		from {
			opacity: 0;
			transform: translate(-50%, 4px);
		}
		to {
			opacity: 1;
			transform: translate(-50%, 0);
		}
	}

	.input-shell {
		padding: 0.375rem 0.375rem 0.375rem 1.125rem;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		transition:
			box-shadow var(--duration-base) var(--ease-out-soft),
			border-color var(--duration-base) var(--ease-out-soft);
	}

	.input-shell:focus-within {
		box-shadow: var(--shadow-card-lg);
		border-color: color-mix(in oklch, var(--color-accent) 30%, var(--color-border));
	}

	.search-icon {
		width: 1.125rem;
		height: 1.125rem;
		color: var(--color-text-muted);
		flex-shrink: 0;
	}

	:global(.search-input) {
		flex: 1;
		min-width: 0;
		border: none;
		background: transparent;
		outline: none;
		font-size: 1rem;
		font-weight: 500;
		color: var(--color-text-primary);
		caret-color: var(--color-accent);
		font-family: inherit;
		padding: 0.4375rem 0;
	}

	:global(.search-input::placeholder) {
		color: var(--color-text-muted);
		font-weight: 400;
	}

	.engine-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.5rem 0.875rem;
		border-radius: var(--radius-pill);
		background: var(--color-accent);
		color: white;
		border: none;
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		font-family: inherit;
		flex-shrink: 0;
		box-shadow: var(--shadow-button);
		transition:
			transform var(--duration-fast) var(--ease-out-soft),
			filter var(--duration-fast) var(--ease-out-soft),
			box-shadow var(--duration-fast) var(--ease-out-soft);
	}

	.engine-button:hover {
		filter: brightness(1.08);
		transform: translateY(-1px);
	}

	.engine-button:active {
		transform: translateY(0) scale(0.97);
	}

	:global(.suggestions) {
		box-sizing: border-box;
		width: var(--bits-combobox-anchor-width);
		max-height: min(22rem, var(--bits-combobox-content-available-height, 22rem));
		padding: 0.375rem;
		overflow: hidden;
		z-index: 50;
	}

	:global(.suggestions-viewport) {
		max-height: inherit;
		overflow-y: auto;
		scrollbar-width: thin;
		scrollbar-color: var(--color-border-strong) transparent;
	}

	:global(.suggestion-item) {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5625rem 0.75rem;
		border-radius: var(--radius-item);
		font-size: 0.9375rem;
		color: var(--color-text-primary);
		cursor: pointer;
		user-select: none;
		outline: none;
		transition: background var(--duration-fast) var(--ease-out-soft);
	}

	:global(.suggestion-item[data-highlighted]) {
		background: var(--color-accent-soft);
	}

	:global(.item-icon) {
		width: 1rem;
		height: 1rem;
		color: var(--color-text-muted);
		flex-shrink: 0;
		transition: color var(--duration-fast) var(--ease-out-soft);
	}

	:global(.item-icon.highlighted) {
		color: var(--color-accent);
	}

	:global(.item-label) {
		flex: 1;
		min-width: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	:global(.item-delete) {
		flex-shrink: 0;
		width: 1.25rem;
		height: 1.25rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		border: none;
		background: transparent;
		color: var(--color-text-muted);
		font-size: 1.125rem;
		line-height: 1;
		border-radius: var(--radius-item);
		cursor: pointer;
		opacity: 0;
		transition:
			opacity var(--duration-fast) var(--ease-out-soft),
			background var(--duration-fast) var(--ease-out-soft),
			color var(--duration-fast) var(--ease-out-soft);
	}

	:global(.suggestion-item:hover .item-delete),
	:global(.suggestion-item[data-highlighted] .item-delete),
	:global(.item-delete:focus-visible) {
		opacity: 1;
	}

	:global(.item-delete:hover) {
		background: color-mix(in oklch, var(--color-text-primary) 10%, transparent);
		color: var(--color-text-primary);
	}
</style>
