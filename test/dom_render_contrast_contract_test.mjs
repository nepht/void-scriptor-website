// Contract for the S4 DOM render & contrast audit: every published public page
// must be mobile-renderable, the responsive menu must start closed with a full
// ARIA state chain, and the light theme must keep readable ink/surface tokens
// behind the global horizontal-overflow guard.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
// app/ holds the compiled Flutter Studio shell (build-owned markup, noindex),
// and .worktrees/ holds duplicate checkouts — neither is a published page twin.
const SKIP_DIRS = new Set(['node_modules', '.git', 'downloads', '.wrangler', 'app', '.worktrees', 'test', 'tools', 'docs/planning']);

const walk = (dir, acc = []) => {
  for (const entry of readdirSync(dir)) {
    const rel = join(dir, entry).slice(ROOT.length);
    if (SKIP_DIRS.has(entry) || [...SKIP_DIRS].some((d) => rel.startsWith(d))) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (entry.endsWith('.html')) acc.push(full);
  }
  return acc;
};

test('viewport meta contract: every published public page declares a mobile viewport', () => {
  const pages = walk(ROOT);
  assert.ok(pages.length >= 20, `expected at least 20 html pages, got ${pages.length}`);

  for (const page of pages) {
    const html = readFileSync(page, 'utf8');
    const hasViewport = /<meta\s+name=["']viewport["']\s+content=["'][^"']*width=device-width[^"']*["']/i.test(html);
    assert.ok(hasViewport, `${page}: missing or malformed <meta name="viewport" content="width=device-width...">`);
  }
});

test('navigation contract: responsive menu toggle keeps its ARIA state chain', () => {
  const homePages = [join(ROOT, 'index.html'), join(ROOT, 'en', 'index.html')];
  for (const file of homePages) {
    const html = readFileSync(file, 'utf8');
    assert.ok(html.includes('id="hamb"'), `${file}: hamburger toggle button id="hamb" must exist`);
    assert.ok(html.includes('aria-controls="nav"'), `${file}: hamburger button must point at aria-controls="nav"`);
    assert.ok(html.includes('aria-expanded="false"'), `${file}: hamburger button must default to aria-expanded="false"`);
    assert.ok(html.includes('<nav id="nav">'), `${file}: nav#nav must ship closed before JavaScript runs`);
  }
});

test('contrast surface contract: light theme keeps readable ink over light surfaces', () => {
  const lightCss = readFileSync(join(ROOT, 'assets', 'light.css'), 'utf8');
  assert.ok(lightCss.includes('--ls-ink:#0b1b2b') || lightCss.includes('--ls-ink: #0b1b2b'),
    'light theme must define a dark --ls-ink text token');
  assert.ok(lightCss.includes('--ls-bg:#f2f6fb') || lightCss.includes('--ls-bg: #f2f6fb'),
    'light theme must define a light --ls-bg surface token');
  assert.ok(lightCss.includes('--ls-muted:#41556b') || lightCss.includes('--ls-muted: #41556b'),
    'light theme must retune the legacy --muted token for readable secondary text');

  const siteCss = readFileSync(join(ROOT, 'assets', 'site.css'), 'utf8');
  assert.ok(/html,\s*body\{[^}]*overflow-x:hidden/.test(siteCss) || /body\{[^}]*overflow-x:hidden/.test(siteCss),
    'site.css must guard the document against horizontal overflow');
});
