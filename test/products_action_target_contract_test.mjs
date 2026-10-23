// Contract: Products standalone action links have usable touch targets without
// turning inline explanatory links into block-like controls.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const pages = ['products.html', 'en/products.html'];
const css = readFileSync('assets/site.css', 'utf8');

test('Products action target rule is scoped and meets WCAG 2.2 target size', () => {
  const rule = css.match(/\.page-products \.docs-action\{([^}]*)\}/)?.[1] ?? '';
  assert.match(rule, /display:inline-flex/);
  assert.match(rule, /align-items:center/);
  assert.match(rule, /min-height:44px/);
  assert.match(rule, /padding:10px 0/);
  assert.doesNotMatch(css, /\.page-products \.docs-(?:card|section|next) a\{[^}]*min-height/,
    'the target rule must not broaden to all Products prose links');
});

test('both localized Products pages mark only standalone actions', () => {
  for (const page of pages) {
    const html = readFileSync(page, 'utf8');
    const actions = html.match(/class="docs-action"/g) ?? [];
    assert.equal(actions.length, 7, `${page}: expected 7 standalone action links`);
    assert.match(html, /<section class="docs-section docs-next"[\s\S]*?<a href="[^"]+">(?![^<]*class=)/,
      `${page}: next-step prose remains ordinary inline links`);
  }
});
