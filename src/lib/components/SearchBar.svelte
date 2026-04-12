<script lang="ts">
	import { Combobox } from 'bits-ui';
	import { onDestroy, onMount, tick } from 'svelte';
	import { engineState } from '$lib/stores/engine.svelte';
	import { fetchSuggestions } from '$lib/utils/autocomplete';
	import { debounce } from '$lib/utils/debounce';
	import { isUrlLike, toUrl } from '$lib/utils/url';

	let query = $state('');
	let suggestions = $state<string[]>([]);
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

	const queryIsUrl = $derived(isUrlLike(query));
	const buttonLabel = $derived(queryIsUrl ? 'Go' : engineState.current.name);

	let inflight: AbortController | null = null;

	const loadSuggestions = debounce(async (q: string) => {
		inflight?.abort();
		const controller = new AbortController();
		inflight = controller;
		const results = await fetchSuggestions(q, controller.signal);
		if (controller.signal.aborted || inflight !== controller) return;
		inflight = null;
		suggestions = results;
		open = results.length > 0;
	}, 180);

	function cancelInflight() {
		loadSuggestions.cancel();
		inflight?.abort();
		inflight = null;
	}

	function handleInput(e: Event & { currentTarget: HTMLInputElement }) {
		const value = e.currentTarget.value;
		query = value;
		userNavigated = false;
		highlightedValue = null;
		suggestions = [];
		if (value.trim() && !isUrlLike(value)) {
			loadSuggestions(value);
		} else {
			cancelInflight();
			open = false;
		}
	}

	function navigate(q: string, { fromSuggestion = false } = {}) {
		const trimmed = q.trim();
		if (!trimmed) return;
		if (!fromSuggestion && isUrlLike(trimmed)) {
			window.location.href = toUrl(trimmed);
			return;
		}
		window.location.href = engineState.current.searchUrl(trimmed);
	}

	function handleKeydown(e: KeyboardEvent) {
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
		if (value) navigate(value, { fromSuggestion: true });
	}

	function onItemHighlight(suggestion: string) {
		highlightedValue = suggestion;
	}

	function onItemUnhighlight(suggestion: string) {
		if (highlightedValue === suggestion) highlightedValue = null;
	}

	onMount(async () => {
		await tick();
		inputEl?.focus();
	});

	onDestroy(() => {
		cancelInflight();
	});
</script>

<div class="search-wrapper">
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
				placeholder="Search the web…"
				autocomplete="off"
				spellcheck="false"
				class="search-input"
				aria-label="Search"
			/>

			<button type="button" class="engine-button" onclick={() => navigate(query)}>
				{buttonLabel}
				<span class="kbd-inline">↵</span>
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
						{#each suggestions as suggestion (suggestion)}
							<Combobox.Item
								value={suggestion}
								label={suggestion}
								class="suggestion-item"
								onHighlight={() => onItemHighlight(suggestion)}
								onUnhighlight={() => onItemUnhighlight(suggestion)}
							>
								{#snippet children({ highlighted })}
									<svg
										class="item-icon"
										class:highlighted
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
									<span class="item-label">{suggestion}</span>
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
		gap: 0.375rem;
		padding: 0.5rem 1rem;
		min-width: 7.25rem;
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

	.kbd-inline {
		font-family: ui-monospace, SFMono-Regular, monospace;
		font-size: 0.8125rem;
		opacity: 0.9;
		margin-left: 0.125rem;
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

	.item-icon {
		width: 1rem;
		height: 1rem;
		color: var(--color-text-muted);
		flex-shrink: 0;
		transition: color var(--duration-fast) var(--ease-out-soft);
	}

	.item-icon.highlighted {
		color: var(--color-accent);
	}

	.item-label {
		flex: 1;
		min-width: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
