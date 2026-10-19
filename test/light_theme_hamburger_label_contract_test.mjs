import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../assets/light.css', import.meta.url), 'utf8');

test('light hamburger bars keep ink background while Menu label uses ink color', () => {
  assert.match(css, /body\.theme-light \.hamb i\{background:var\(--ls-ink\)\}/);
  assert.match(css, /body\.theme-light \.hamb::after\{background:transparent;color:var\(--ls-ink\)\}/);
  assert.doesNotMatch(css, /body\.theme-light \.hamb i,body\.theme-light \.hamb::after\{background:var\(--ls-ink\)\}/);
});
