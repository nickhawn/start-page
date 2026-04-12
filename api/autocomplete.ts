export const config = { runtime: 'edge' };

const UPSTREAM = 'https://suggestqueries.google.com/complete/search';
const TIMEOUT_MS = 3000;

function emptyPayload(): Response {
	return new Response(JSON.stringify(['', []]), {
		headers: { 'content-type': 'application/json' }
	});
}

export default async function handler(req: Request): Promise<Response> {
	const url = new URL(req.url);
	const q = url.searchParams.get('q')?.trim() ?? '';
	if (!q) return emptyPayload();

	const upstream = new URL(UPSTREAM);
	upstream.searchParams.set('client', url.searchParams.get('client') ?? 'chrome');
	upstream.searchParams.set('q', q);

	try {
		const res = await fetch(upstream, { signal: AbortSignal.timeout(TIMEOUT_MS) });
		if (!res.ok) return emptyPayload();
		const body = await res.text();
		return new Response(body, {
			headers: {
				'content-type': 'application/json',
				'cache-control': 's-maxage=300, stale-while-revalidate=600'
			}
		});
	} catch {
		return emptyPayload();
	}
}
