import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const siteRoot = fileURLToPath(new URL('..', import.meta.url));
const scenesDir = path.join(siteRoot, 'assets', 'scenes');
const lightCss = readFileSync(path.join(siteRoot, 'assets', 'light.css'), 'utf8');

function walkHtml(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === '.git' || entry === '.wrangler' || entry === 'node_modules' || entry === 'work' || entry === 'test') {
      continue;
    }
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkHtml(full, acc);
    } else if (entry.endsWith('.html')) {
      acc.push(full);
    }
  }
  return acc;
}

const htmlFiles = walkHtml(siteRoot);

test('every page-art band declares a narrow-screen 1280 artwork variant', () => {
  let checked = 0;
  for (const file of htmlFiles) {
    const source = readFileSync(file, 'utf8');
    const match = source.match(/--page-art:url\('\/assets\/scenes\/([a-z0-9-]+)\.webp'\)/);
    if (!match) continue;
    checked += 1;
    const slug = match[1];
    const rel = path.relative(siteRoot, file).replace(/\\/g, '/');
    assert.match(
      source,
      new RegExp(`--page-art-sm:url\\('/assets/scenes/${slug}-1280\\.webp'\\)`),
      `${rel} must declare --page-art-sm pointing at the 1280 variant`,
    );
    assert.ok(
      existsSync(path.join(scenesDir, `${slug}-1280.webp`)),
      `${rel} references a missing ${slug}-1280.webp asset`,
    );
  }
  assert.ok(checked >= 20, `expected the page-art band on the public pages, found ${checked}`);
});

test('light.css swaps the band artwork for the 1280 variant on narrow viewports', () => {
  const block = lightCss.match(/@media\(max-width:760px\)\{([\s\S]*?)\n\}/);
  assert.ok(block, 'light.css must keep a 760px breakpoint block');
  assert.match(
    block[1],
    /body\.theme-light \.page-art\{background-image:var\(--page-art-sm,var\(--page-art\)\)\}/,
    'the 760px block must prefer --page-art-sm with --page-art as fallback',
  );
});

test('every published page references one shared light.css revision', () => {
  const revisions = new Set();
  for (const file of htmlFiles) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/light\.css\?v=([A-Za-z0-9._-]+)/g)) {
      revisions.add(match[1]);
    }
  }
  assert.equal(revisions.size, 1, `expected a single light.css revision, saw ${[...revisions].join(', ')}`);
});
