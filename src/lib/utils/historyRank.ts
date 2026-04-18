import type { HistoryEntry } from './historyStorage';
import { urlNormalize } from './url';

const DAY_MS = 86_400_000;

export const DECAY_DAYS = 30;
export const NEAR_DUP_LEV_CAP = 2;
export const DISPLAY_LIMIT = 3;
export const HOSTNAME_PREFIX_BOOST = 5;

export function normalize(s: string): string {
	return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function levenshteinBounded(a: string, b: string, cap: number): number {
	if (a === b) return 0;
	if (Math.abs(a.length - b.length) > cap) return cap + 1;

	const m = a.length;
	const n = b.length;
	if (m === 0) return n <= cap ? n : cap + 1;
	if (n === 0) return m <= cap ? m : cap + 1;

	let prev = new Array<number>(n + 1);
	let curr = new Array<number>(n + 1);
	for (let j = 0; j <= n; j++) prev[j] = j;

	for (let i = 1; i <= m; i++) {
		curr[0] = i;
		let rowMin = curr[0];
		for (let j = 1; j <= n; j++) {
			const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
			curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
			if (curr[j] < rowMin) rowMin = curr[j];
		}
		if (rowMin > cap) return cap + 1;
		[prev, curr] = [curr, prev];
	}
	return prev[n];
}

export function isNearDuplicate(a: string, b: string): boolean {
	const na = normalize(a);
	const nb = normalize(b);
	if (na === nb) return true;
	if (!(na.startsWith(nb) || nb.startsWith(na))) return false;
	return levenshteinBounded(na, nb, NEAR_DUP_LEV_CAP) <= NEAR_DUP_LEV_CAP;
}

export function rank(e: HistoryEntry, now: number = Date.now()): number {
	const ageDays = (now - e.lastAt) / DAY_MS;
	return e.count - ageDays / DECAY_DAYS;
}

export function matchEntries(
	query: string,
	entries: readonly HistoryEntry[],
	now: number,
	limit: number = DISPLAY_LIMIT
): HistoryEntry[] {
	const q = normalize(query);
	if (!q) return [];

	type Scored = { e: HistoryEntry; s: number };
	const scored: Scored[] = [];

	for (const e of entries) {
		if (!e.confirmed) continue;
		if (rank(e, now) <= 0) continue;
		const nv = normalize(e.value);
		const uv = e.kind === 'url' ? urlNormalize(e.value) : nv;
		if (!nv.includes(q) && !uv.includes(q)) continue;
		const ageDays = (now - e.lastAt) / DAY_MS;
		const prefixBoost = nv.startsWith(q) || uv.startsWith(q) ? 1 : 0;
		const hostnameBoost = e.kind === 'url' && uv.startsWith(q) ? HOSTNAME_PREFIX_BOOST : 0;
		scored.push({
			e,
			s: 2 * e.count - ageDays / DECAY_DAYS + prefixBoost + hostnameBoost
		});
	}

	scored.sort((a, b) => b.s - a.s);
	return scored.slice(0, limit).map((x) => x.e);
}
