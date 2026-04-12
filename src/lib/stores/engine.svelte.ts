import { ENGINES, DEFAULT_ENGINE_INDEX, type SearchEngine } from '$lib/config/engines';

let index = $state(DEFAULT_ENGINE_INDEX);

export const engineState = {
	get index(): number {
		return index;
	},
	get current(): SearchEngine {
		return ENGINES[index];
	},
	get all(): readonly SearchEngine[] {
		return ENGINES;
	},
	cycle(): void {
		index = (index + 1) % ENGINES.length;
	},
	set(i: number): void {
		if (i >= 0 && i < ENGINES.length) index = i;
	}
};
