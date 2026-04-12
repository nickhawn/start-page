import {
	MAX_ENTRIES,
	readFile,
	writeFile,
	type HistoryEntry,
	type HistoryFile
} from '$lib/utils/historyStorage';
import {
	DISPLAY_LIMIT,
	isNearDuplicate,
	matchEntries,
	normalize,
	rank
} from '$lib/utils/historyRank';

const PROBATION_COUNT = 2;

let entries = $state<HistoryEntry[]>([]);
let paused = $state(false);
let hydrated = false;

function persist(): void {
	const file: HistoryFile = { version: 1, paused, entries: [...entries] };
	writeFile(file);
}

function evictIfOverCap(skipIdx: number = -1): void {
	if (entries.length <= MAX_ENTRIES) return;
	const now = Date.now();
	let worstIdx = -1;
	let worstScore = Infinity;
	for (let i = 0; i < entries.length; i++) {
		if (i === skipIdx) continue;
		const s = rank(entries[i], now);
		if (
			worstIdx < 0 ||
			s < worstScore ||
			(s === worstScore && entries[i].lastAt < entries[worstIdx].lastAt)
		) {
			worstScore = s;
			worstIdx = i;
		}
	}
	if (worstIdx < 0) return;
	entries = entries.filter((_, i) => i !== worstIdx);
}

export const historyState = {
	get entries(): readonly HistoryEntry[] {
		return entries;
	},
	get paused(): boolean {
		return paused;
	},
	get size(): number {
		return entries.length;
	},

	hydrate(): void {
		if (hydrated) return;
		hydrated = true;
		const file = readFile();
		entries = file.entries;
		paused = file.paused;
	},

	record(value: string, kind: 'query' | 'url'): void {
		if (paused) return;
		const trimmed = value.trim();
		if (!trimmed) return;
		const now = Date.now();

		const existingIdx = entries.findIndex(
			(e) => e.kind === kind && isNearDuplicate(e.value, trimmed)
		);

		if (existingIdx >= 0) {
			const existing = entries[existingIdx];
			const nextCount = existing.count + 1;
			const updated: HistoryEntry = {
				...existing,
				value: trimmed,
				count: nextCount,
				lastAt: now,
				confirmed: existing.confirmed || nextCount >= PROBATION_COUNT
			};
			const next = entries.slice();
			next[existingIdx] = updated;
			entries = next;
		} else {
			const fresh: HistoryEntry = {
				id: `${kind}:${normalize(trimmed)}`,
				value: trimmed,
				kind,
				count: 1,
				firstAt: now,
				lastAt: now,
				confirmed: false
			};
			entries = [...entries, fresh];
			evictIfOverCap(entries.length - 1);
		}

		persist();
	},

	confirm(id: string): void {
		const idx = entries.findIndex((e) => e.id === id);
		if (idx < 0) return;
		if (entries[idx].confirmed) return;
		const next = entries.slice();
		next[idx] = { ...next[idx], confirmed: true };
		entries = next;
		persist();
	},

	match(query: string, limit: number = DISPLAY_LIMIT): HistoryEntry[] {
		return matchEntries(query, entries, Date.now(), limit);
	},

	remove(id: string): void {
		const next = entries.filter((e) => e.id !== id);
		if (next.length === entries.length) return;
		entries = next;
		persist();
	},

	clear(): void {
		entries = [];
		persist();
	},

	setPaused(p: boolean): void {
		if (paused === p) return;
		paused = p;
		persist();
	},

	prune(now: number = Date.now()): void {
		const next = entries.filter((e) => rank(e, now) > 0);
		if (next.length === entries.length) return;
		entries = next;
		persist();
	}
};

export function _resetForTests(): void {
	entries = [];
	paused = false;
	hydrated = false;
}
