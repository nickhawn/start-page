import { describe, expect, it } from 'vitest';
import { isUrlLike, toUrl } from './url';

describe('isUrlLike', () => {
	it.each([
		['https://example.com', true],
		['http://example.com', true],
		['HTTPS://Example.COM/path?q=1', true],
		['example.com', true],
		['sub.example.co.uk', true],
		['example.com/path?x=1', true],
		['example.com:8080', true],
		['localhost', true],
		['localhost:3000', true],
		['localhost:3000/path', true],
		['192.168.1.1', true],
		['127.0.0.1:8080', true],
		['10.0.0.1/health', true],
		['255.255.255.255', true]
	])('accepts %s', (input, expected) => {
		expect(isUrlLike(input)).toBe(expected);
	});

	it.each([
		['', false],
		['   ', false],
		['hello world', false],
		['hello', false],
		['javascript:alert(1)', false],
		['JAVASCRIPT:alert(1)', false],
		['data:text/html,<script>alert(1)</script>', false],
		['vbscript:msgbox(1)', false],
		['file:///etc/passwd', false],
		['ftp://example.com', false],
		['example', false],
		['256.256.256.256', false],
		['999.999.999.999', false],
		['1.2.3', false],
		['http:/example.com', false],
		['example .com', false]
	])('rejects %s', (input, expected) => {
		expect(isUrlLike(input)).toBe(expected);
	});
});

describe('toUrl', () => {
	it('preserves existing http protocol', () => {
		expect(toUrl('http://example.com')).toBe('http://example.com');
	});

	it('preserves existing https protocol', () => {
		expect(toUrl('https://example.com/path?x=1')).toBe('https://example.com/path?x=1');
	});

	it('prepends https:// to bare domains', () => {
		expect(toUrl('example.com')).toBe('https://example.com');
	});

	it('prepends https:// to localhost', () => {
		expect(toUrl('localhost:3000')).toBe('https://localhost:3000');
	});

	it('trims surrounding whitespace', () => {
		expect(toUrl('  example.com  ')).toBe('https://example.com');
	});

	it('is case-insensitive for protocol match', () => {
		expect(toUrl('HTTPS://example.com')).toBe('HTTPS://example.com');
	});
});
