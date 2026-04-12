<script lang="ts">
	import SearchBar from '$lib/components/SearchBar.svelte';
</script>

<svelte:head>
	<title>New Tab</title>
</svelte:head>

<main class="page">
	<SearchBar />
</main>

<style>
	.page {
		position: relative;
		min-height: 100dvh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem 1.5rem;
		overflow: hidden;
		background-color: var(--color-bg-page);
	}
</style>
