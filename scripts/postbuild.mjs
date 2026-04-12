// Chrome MV3 extension pages cannot execute inline scripts
// (script-src 'self' is enforced). SvelteKit's static adapter inlines
// the bootstrap script into index.html, so we extract it to an external
// file after the build.

import fs from 'node:fs';
import path from 'node:path';

const BUILD_DIR = 'build';
const INDEX_PATH = path.join(BUILD_DIR, 'index.html');
const BOOTSTRAP_PATH = path.join(BUILD_DIR, '_app', 'bootstrap.js');

const html = fs.readFileSync(INDEX_PATH, 'utf-8');

const inlineScriptRegex = /<script>([\s\S]*?)<\/script>/;
const match = html.match(inlineScriptRegex);

if (!match) {
	console.log('[postbuild] No inline script found — nothing to extract.');
	process.exit(0);
}

fs.writeFileSync(BOOTSTRAP_PATH, match[1].trim() + '\n');

const rewritten = html.replace(inlineScriptRegex, '<script src="./_app/bootstrap.js"></script>');

fs.writeFileSync(INDEX_PATH, rewritten);

console.log('[postbuild] Extracted inline bootstrap → _app/bootstrap.js');
