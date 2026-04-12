/// <reference types="vitest/config" />
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// Proxy used for local dev + preview only: Chrome extension builds
// hit Google's endpoint directly via manifest host_permissions.
const autocompleteProxy = {
	'/api/autocomplete': {
		target: 'https://suggestqueries.google.com',
		changeOrigin: true,
		rewrite: (path: string) => path.replace(/^\/api\/autocomplete/, '/complete/search')
	}
};

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: { proxy: autocompleteProxy },
	preview: { proxy: autocompleteProxy },
	resolve: (globalThis as { process?: { env?: { VITEST?: string } } }).process?.env?.VITEST
		? { conditions: ['browser'] }
		: undefined,
	test: {
		globals: true,
		environment: 'jsdom',
		include: ['src/**/*.{test,spec}.{js,ts}']
	}
});
