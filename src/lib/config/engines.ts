export interface SearchEngine {
	readonly id: string;
	readonly name: string;
	readonly color: string;
	searchUrl: (query: string) => string;
}

export const ENGINES: readonly SearchEngine[] = [
	{
		id: 'kagi',
		name: 'Kagi',
		color: '#FFB319',
		searchUrl: (q) => `https://kagi.com/search?q=${encodeURIComponent(q)}`
	},
	{
		id: 'perplexity',
		name: 'Perplexity',
		color: '#20B8CD',
		searchUrl: (q) => `https://www.perplexity.ai/search?q=${encodeURIComponent(q)}`
	},
	{
		id: 'claude',
		name: 'Claude',
		color: '#D4A96A',
		searchUrl: (q) => `https://claude.ai/new?q=${encodeURIComponent(q)}`
	}
] as const;

export const DEFAULT_ENGINE_INDEX = 0;
