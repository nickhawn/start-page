export interface HistoryEntry {
	id: string;
	value: string;
	kind: 'query' | 'url';
	count: number;
	firstAt: number;
	lastAt: number;
	confirmed: boolean;
}

export interface HistoryFile {
	version: 1;
	paused: boolean;
	entries: HistoryEntry[];
}

export const STORAGE_KEY = 'newtab:history:v1';
export const CURRENT_VERSION = 1;
export const MAX_ENTRIES = 50;

export function emptyFile(): HistoryFile {
	return { version: CURRENT_VERSION, paused: false, entries: [] };
}

function isValidEntry(v: unknown): v is HistoryEntry {
	if (!v || typeof v !== 'object') return false;
	const e = v as Record<string, unknown>;
	return (
		typeof e.id === 'string' &&
		typeof e.value === 'string' &&
		(e.kind === 'query' || e.kind === 'url') &&
		typeof e.count === 'number' &&
		Number.isFinite(e.count) &&
		typeof e.firstAt === 'number' &&
		typeof e.lastAt === 'number' &&
		typeof e.confirmed === 'boolean'
	);
}

function isValidFile(v: unknown): v is HistoryFile {
	if (!v || typeof v !== 'object') return false;
	const f = v as Record<string, unknown>;
	return (
		f.version === CURRENT_VERSION &&
		typeof f.paused === 'boolean' &&
		Array.isArray(f.entries) &&
		f.entries.every(isValidEntry)
	);
}

function getStorage(): Storage | null {
	try {
		return typeof localStorage !== 'undefined' ? localStorage : null;
	} catch {
		return null;
	}
}

export function readFile(): HistoryFile {
	const storage = getStorage();
	if (!storage) return emptyFile();

	let raw: string | null;
	try {
		raw = storage.getItem(STORAGE_KEY);
	} catch {
		return emptyFile();
	}
	if (raw === null) return emptyFile();

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		const empty = emptyFile();
		writeFile(empty);
		return empty;
	}

	if (!isValidFile(parsed)) {
		const empty = emptyFile();
		writeFile(empty);
		return empty;
	}

	return parsed;
}

export function writeFile(file: HistoryFile): void {
	const storage = getStorage();
	if (!storage) return;
	try {
		storage.setItem(STORAGE_KEY, JSON.stringify(file));
	} catch {
		// QuotaExceededError or any other storage failure — silent degrade
	}
}

let availabilityCache: boolean | undefined;

export function isStorageAvailable(): boolean {
	if (availabilityCache !== undefined) return availabilityCache;
	const storage = getStorage();
	if (!storage) return (availabilityCache = false);
	const probe = '__newtab_probe__';
	try {
		storage.setItem(probe, '1');
		storage.getItem(probe);
		storage.removeItem(probe);
		return (availabilityCache = true);
	} catch {
		return (availabilityCache = false);
	}
}

export function _resetAvailabilityCacheForTests(): void {
	availabilityCache = undefined;
}
