// Contract: every <nav> landmark that is not already labelled by a preceding
// heading must expose an accessible name, so assistive technology announces
// "Primary navigation" instead of a bare generic "navigation".
//
// Scope: published public pages only (app/, docs index shells, .worktrees and
// build-owned directories are excluded — they are not hand-authored pages).
//
// Rules enforced:
// 1. Site header menu on index.html / en/index.html carries an accessible name.
// 2. Section menu on quiz.html / en/quiz.html carries an accessible name.
// 3. No hand-authored public page ships an unlabelled <nav> landmark.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.wrangler',
  '.worktrees',
  'app',
  'test',
  'tools',
  'downloads',
]);

const walk = (dir, acc = []) => {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (entry.endsWith('.html')) acc.push(full);
  }
  return acc;
};

const rel = (file) => file.slice(ROOT.length).replace(/\\/g, '/');

const NAV_RE = /<nav\b([^>]*)>/gi;

test('nav landmark contract: homepage header menu exposes an accessible name', () => {
  for (const file of [join(ROOT, 'index.html'), join(ROOT, 'en', 'index.html')]) {
    const html = readFileSync(file, 'utf8');
    const navs = [...html.matchAll(NAV_RE)].map((m) => m[1]);
    assert.ok(navs.length > 0, `${rel(file)}: expected at least one <nav>`);

    const primary = navs.find((attrs) => /id=["']nav["']/.test(attrs));
    assert.ok(primary, `${rel(file)}: expected the header menu <nav id="nav">`);

    // The mobile menu is a disclosure region toggled by #hamb; the accessible
    // name must describe it as the primary navigation, not as a list.
    assert.match(
      primary,
      /aria-label=["'](?:Primary navigation|Navigasi utama)["']/,
      `${rel(file)}: <nav id="nav"> must declare aria-label="Primary navigation"`,
    );
  }
});

test('nav landmark contract: quiz section menu exposes an accessible name', () => {
  for (const file of [join(ROOT, 'quiz.html'), join(ROOT, 'en', 'quiz.html')]) {
    const html = readFileSync(file, 'utf8');
    const navs = [...html.matchAll(NAV_RE)].map((m) => m[1]);
    assert.ok(navs.length > 0, `${rel(file)}: expected at least one <nav>`);

    const anchorNav = navs.find((attrs) => /#kanon/.test(attrs));
    const target = anchorNav ?? navs[0];

    assert.match(
      target,
      /aria-label=["'][^"']+["']/,
      `${rel(file)}: the quiz section menu must declare an aria-label`,
    );
  }
});

test('nav landmark contract: no public page ships an unlabelled <nav>', () => {
  const pages = walk(ROOT).filter(
    (file) => !rel(file).endsWith('404.html') || true,
  );
  assert.ok(pages.length >= 30, `expected at least 30 pages, got ${pages.length}`);

  const offenders = [];
  for (const file of pages) {
    const html = readFileSync(file, 'utf8');
    for (const match of html.matchAll(NAV_RE)) {
      const attrs = match[1];
      const labelled =
        /aria-label\s*=/.test(attrs) || /aria-labelledby\s*=/.test(attrs);
      if (!labelled) offenders.push(`${rel(file)} -> <nav${attrs}>`);
    }
  }

  assert.deepEqual(offenders, [], `unlabelled <nav> landmarks: ${offenders.join(', ')}`);
});