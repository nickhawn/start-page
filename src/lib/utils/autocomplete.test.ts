import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchSuggestions } from './autocomplete';

const fetchMock = vi.fn();

beforeEach(() => {
	vi.stubGlobal('fetch', fetchMock);
	fetchMock.mockReset();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

function jsonResponse(data: unknown, ok = true): Response {
	return {
		ok,
		json: async () => data
	} as unknown as Response;
}

describe('fetchSuggestions', () => {
	it('returns [] for an empty query and does not fetch', async () => {
		const result = await fetchSuggestions('');
		expect(result).toEqual([]);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('returns [] for a whitespace-only query and does not fetch', async () => {
		const result = await fetchSuggestions('   ');
		expect(result).toEqual([]);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('returns the suggestions array from the response', async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse(['query', ['foo', 'bar']]));
		const result = await fetchSuggestions('query');
		expect(result).toEqual(['foo', 'bar']);
	});

	it('passes client=chrome and the query to the endpoint', async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse(['q', []]));
		await fetchSuggestions('hello world');

		expect(fetchMock).toHaveBeenCalledOnce();
		const [url] = fetchMock.mock.calls[0];
		const parsed = new URL(url as string);
		expect(parsed.searchParams.get('client')).toBe('chrome');
		expect(parsed.searchParams.get('q')).toBe('hello world');
	});

	it('sends no-referrer referrerPolicy', async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse(['q', []]));
		await fetchSuggestions('q');
		const init = fetchMock.mock.calls[0][1] as RequestInit;
		expect(init.referrerPolicy).toBe('no-referrer');
	});

	it('returns [] when response is not ok', async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse(['q', ['x']], false));
		const result = await fetchSuggestions('q');
		expect(result).toEqual([]);
	});

	it('returns [] when data[1] is not an array', async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse(['q', null]));
		const result = await fetchSuggestions('q');
		expect(result).toEqual([]);
	});

	it('returns [] when the fetch throws a network error', async () => {
		fetchMock.mockRejectedValueOnce(new TypeError('network down'));
		const result = await fetchSuggestions('q');
		expect(result).toEqual([]);
	});

	it('returns [] silently when aborted', async () => {
		const controller = new AbortController();
		fetchMock.mockImplementationOnce(
			() =>
				new Promise((_resolve, reject) => {
					controller.signal.addEventListener('abort', () => {
						reject(new DOMException('Aborted', 'AbortError'));
					});
				})
		);

		const promise = fetchSuggestions('q', controller.signal);
		controller.abort();
		const result = await promise;
		expect(result).toEqual([]);
	});

	it('forwards the signal to fetch', async () => {
		const controller = new AbortController();
		fetchMock.mockResolvedValueOnce(jsonResponse(['q', []]));
		await fetchSuggestions('q', controller.signal);
		const init = fetchMock.mock.calls[0][1] as RequestInit;
		expect(init.signal).toBe(controller.signal);
	});
});
