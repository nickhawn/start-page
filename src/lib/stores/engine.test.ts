import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_ENGINE_INDEX, ENGINES } from '$lib/config/engines';
import { engineState } from './engine.svelte';

describe('engineState', () => {
	beforeEach(() => {
		engineState.set(DEFAULT_ENGINE_INDEX);
	});

	it('starts at the default engine', () => {
		expect(engineState.index).toBe(DEFAULT_ENGINE_INDEX);
		expect(engineState.current).toBe(ENGINES[DEFAULT_ENGINE_INDEX]);
	});

	it('cycles forward through engines', () => {
		engineState.cycle();
		expect(engineState.index).toBe((DEFAULT_ENGINE_INDEX + 1) % ENGINES.length);
	});

	it('wraps cycle at the last engine', () => {
		engineState.set(ENGINES.length - 1);
		engineState.cycle();
		expect(engineState.index).toBe(0);
	});

	it('set() ignores out-of-range indices', () => {
		engineState.set(2);
		engineState.set(ENGINES.length);
		expect(engineState.index).toBe(2);

		engineState.set(-1);
		expect(engineState.index).toBe(2);
	});

	it('set() accepts valid indices', () => {
		for (let i = 0; i < ENGINES.length; i++) {
			engineState.set(i);
			expect(engineState.index).toBe(i);
			expect(engineState.current).toBe(ENGINES[i]);
		}
	});

	it('all exposes the full engine list', () => {
		expect(engineState.all).toHaveLength(ENGINES.length);
	});
});
