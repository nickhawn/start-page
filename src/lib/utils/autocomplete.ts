type AutocompleteResponse = [string, string[], ...unknown[]];

// In the Chrome extension context we fetch Google directly — the
// manifest's host_permissions grant the needed CORS bypass.
// In dev/preview we route through a Vite proxy so localhost works too.
function resolveEndpoint(): string {
	if (typeof location !== 'undefined' && location.protocol === 'chrome-extension:') {
		return 'https://suggestqueries.google.com/complete/search';
	}
	return '/api/autocomplete';
}

function isAbortError(err: unknown): boolean {
	return err instanceof DOMException && err.name === 'AbortError';
}

export async function fetchSuggestions(query: string, signal?: AbortSignal): Promise<string[]> {
	const trimmed = query.trim();
	if (!trimmed) return [];

	const base = typeof location !== 'undefined' ? location.href : 'http://localhost';
	const url = new URL(resolveEndpoint(), base);
	url.searchParams.set('client', 'chrome');
	url.searchParams.set('q', trimmed);

	try {
		const res = await fetch(url.toString(), { signal, referrerPolicy: 'no-referrer' });
		if (!res.ok) return [];
		const data = (await res.json()) as AutocompleteResponse;
		return Array.isArray(data[1]) ? data[1] : [];
	} catch (err) {
		if (isAbortError(err)) return [];
		if (import.meta.env?.DEV) console.warn('[autocomplete] fetch failed', err);
		return [];
	}
}
