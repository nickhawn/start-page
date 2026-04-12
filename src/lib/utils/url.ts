const PROTOCOL_RE = /^https?:\/\//i;
const DOMAIN_RE = /^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?::\d+)?(\/.*)?$/i;
const LOCALHOST_RE = /^localhost(?::\d+)?(\/.*)?$/i;
const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?::\d+)?(\/.*)?$/;

function isValidIpv4(input: string): boolean {
	const match = IPV4_RE.exec(input);
	if (!match) return false;
	for (let i = 1; i <= 4; i++) {
		const octet = Number(match[i]);
		if (octet > 255) return false;
	}
	return true;
}

export function isUrlLike(input: string): boolean {
	const q = input.trim();
	if (!q || /\s/.test(q)) return false;
	if (PROTOCOL_RE.test(q)) return true;
	return DOMAIN_RE.test(q) || LOCALHOST_RE.test(q) || isValidIpv4(q);
}

export function toUrl(input: string): string {
	const q = input.trim();
	return PROTOCOL_RE.test(q) ? q : `https://${q}`;
}
