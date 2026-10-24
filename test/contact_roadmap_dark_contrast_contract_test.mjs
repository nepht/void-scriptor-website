// Contract: contact and roadmap supporting copy must clear WCAG AA in dark mode
// without changing the light-theme token contract.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const css = readFileSync(join(ROOT, 'assets', 'site.css'), 'utf8');
const light = readFileSync(join(ROOT, 'assets', 'light.css'), 'utf8');

test('dark contact supporting copy uses the readable dark token', () => {
  assert.match(css, /\.page-contact\.theme-dark \.form \.hint,\.page-contact\.theme-dark \.form \.note\{color:var\(--ash\)\}/);
});

test('dark roadmap supporting copy uses the readable dark token', () => {
  assert.match(css, /\.page-roadmap\.theme-dark \.docnav a,\.page-roadmap\.theme-dark \.docs-card-head code,\.page-roadmap\.theme-dark \.copyline\{color:var\(--ash\)!important\}/);
});

test('light theme retains scoped light overrides for the affected surfaces', () => {
  assert.match(light, /body\.theme-light \.docnav a[\s\S]*?color:var\(--ls-ink\)/);
  assert.match(light, /body\.theme-light \.copyline\{color:var\(--ls-muted\)\}/);
  assert.doesNotMatch(light, /body\.theme-light \.form \.hint[^}]*var\(--ash\)/);
});
