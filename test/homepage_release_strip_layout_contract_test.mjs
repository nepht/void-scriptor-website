// Contract: homepage release actions remain visibly separated and responsive.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const css = readFileSync(join(ROOT, 'assets', 'site.css'), 'utf8');

for (const page of ['index.html', 'en/index.html']) {
  const html = readFileSync(join(ROOT, page), 'utf8');
  test(`${page} keeps two release actions`, () => {
    const section = html.match(/<section class="release-strip[\s\S]*?<\/section>/)?.[0] ?? '';
    assert.equal((section.match(/class="release-link"/g) ?? []).length, 2,
      `${page} must keep exactly two release links`);
    assert.match(section, /class="release-actions"/, `${page} needs the release actions wrapper`);
  });
}

test('release actions use a real layout gap', () => {
  assert.match(css,
    /\.page-home \.release-actions\{[^}]*display:flex[^}]*flex-direction:column[^}]*gap:8px/,
    'release actions need explicit separation between stacked links');
});

test('release links remain usable on narrow screens', () => {
  assert.match(css, /@media\(max-width:600px\)/,
    'mobile release layout needs a narrow-screen media query');
  assert.match(css, /\.page-home \.release-link\{width:100%;justify-content:flex-start\}/,
    'mobile release links should retain full-width touch targets');
});
