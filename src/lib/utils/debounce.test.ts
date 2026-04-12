import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debounce } from './debounce';

describe('debounce', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('delays invocation until after wait', () => {
		const fn = vi.fn();
		const debounced = debounce(fn, 100);

		debounced('a');
		expect(fn).not.toHaveBeenCalled();

		vi.advanceTimersByTime(99);
		expect(fn).not.toHaveBeenCalled();

		vi.advanceTimersByTime(1);
		expect(fn).toHaveBeenCalledOnce();
		expect(fn).toHaveBeenCalledWith('a');
	});

	it('cancels the previous pending call when invoked again', () => {
		const fn = vi.fn();
		const debounced = debounce(fn, 100);

		debounced('first');
		vi.advanceTimersByTime(50);
		debounced('second');
		vi.advanceTimersByTime(100);

		expect(fn).toHaveBeenCalledOnce();
		expect(fn).toHaveBeenCalledWith('second');
	});

	it('forwards all arguments to the wrapped fn', () => {
		const fn = vi.fn();
		const debounced = debounce(fn, 50);

		debounced('a', 1, { x: true });
		vi.advanceTimersByTime(50);

		expect(fn).toHaveBeenCalledWith('a', 1, { x: true });
	});

	it('cancel() prevents a pending invocation from firing', () => {
		const fn = vi.fn();
		const debounced = debounce(fn, 100);

		debounced('a');
		debounced.cancel();
		vi.advanceTimersByTime(500);

		expect(fn).not.toHaveBeenCalled();
	});

	it('cancel() is safe to call when nothing is pending', () => {
		const fn = vi.fn();
		const debounced = debounce(fn, 100);

		expect(() => debounced.cancel()).not.toThrow();
		debounced.cancel();

		debounced('a');
		vi.advanceTimersByTime(100);
		expect(fn).toHaveBeenCalledOnce();
	});

	it('can be re-invoked after cancel()', () => {
		const fn = vi.fn();
		const debounced = debounce(fn, 100);

		debounced('a');
		debounced.cancel();
		debounced('b');
		vi.advanceTimersByTime(100);

		expect(fn).toHaveBeenCalledOnce();
		expect(fn).toHaveBeenCalledWith('b');
	});
});
