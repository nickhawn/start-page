<script lang="ts">
	type Props = {
		kind: 'query' | 'url' | 'suggest';
		highlighted?: boolean;
	};

	let { kind, highlighted = false }: Props = $props();
</script>

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
	{#if kind === 'suggest'}
		<circle cx="11" cy="11" r="7" />
		<path d="m20 20-3.5-3.5" />
	{:else if kind === 'query'}
		<circle cx="12" cy="12" r="9" />
		<path d="M12 7v5l3 2" />
	{:else}
		<circle cx="12" cy="12" r="9" />
		<path d="M3 12h18" />
		<path d="M12 3a14 14 0 0 1 0 18" />
		<path d="M12 3a14 14 0 0 0 0 18" />
	{/if}
</svg>
