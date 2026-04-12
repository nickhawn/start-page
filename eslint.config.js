import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import svelteParser from 'svelte-eslint-parser';
import globals from 'globals';

export default [
	{ ignores: ['.svelte-kit/', 'build/', 'node_modules/', 'dist/'] },
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs['flat/recommended'],
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node
			}
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts'],
		languageOptions: {
			parser: svelteParser,
			parserOptions: {
				parser: ts.parser,
				extraFileExtensions: ['.svelte']
			}
		}
	},
	{
		files: ['**/*.test.ts', '**/*.spec.ts'],
		languageOptions: {
			globals: {
				...globals.node
			}
		},
		rules: {
			'@typescript-eslint/no-explicit-any': 'off'
		}
	}
];
