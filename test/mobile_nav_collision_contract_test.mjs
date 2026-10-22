// Contract: in mobile viewports (<=760px), in-page document navigation (.docnav)
// must stay in static document flow rather than floating position:absolute,
// preventing severe visual collisions with page titles (h1) and introductory copy (.lede).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SITE_CSS_PATH = join(ROOT, 'assets', 'site.css');

test('mobile navigation layout contract: header mobile menu rule is scoped to header nav', () => {
  const css = readFileSync(SITE_CSS_PATH, 'utf8');

  // The mobile menu dropdown rules must target header nav, NOT bare generic nav,
  // so body-level <nav class="docnav"> landmarks do not become position:absolute overlays.
  assert.match(
    css,
    /@media\s*\(max-width:\s*760px\)\s*\{[\s\S]*?header\s+nav\{display:none;position:absolute;left:16px;right:16px;top:68px/,
    'assets/site.css must scope mobile dropdown menu to "header nav", not bare "nav"',
  );
  assert.match(
    css,
    /@media\s*\(max-width:\s*760px\)\s*\{[\s\S]*?header\s+nav\.open\{display:flex\}/,
    'assets/site.css must scope "header nav.open{display:flex}"',
  );
  assert.match(
    css,
    /@media\s*\(max-width:\s*760px\)\s*\{[\s\S]*?header\s+nav\s+a\{padding:0 12px\}/,
    'assets/site.css must scope "header nav a{padding:0 12px}"',
  );
});

test('mobile document navigation contract: .docnav is static and wraps cleanly on narrow screens', () => {
  const css = readFileSync(SITE_CSS_PATH, 'utf8');

  // .docnav must be styled as static document flow on mobile
  assert.match(
    css,
    /\.docnav\s*\{[^}]*position:\s*static/,
    '.docnav must explicitly declare position: static',
  );
});
