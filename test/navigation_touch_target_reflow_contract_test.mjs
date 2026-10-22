// Contract: navigation touch targets and responsive mobile reflow (WCAG 2.5.8 & WCAG 1.4.10).
// - All navigation controls (.btn-lang, .brand, nav links, hamb) must meet >= 44x44px touch targets.
// - Layout containers must prevent horizontal overflow across breakpoints (320px, 768px, 1100px).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SITE_CSS_PATH = resolve(process.cwd(), 'assets/site.css');

test('navigation touch target: .btn-lang declares at least 44px width and 44px height', () => {
  const css = readFileSync(SITE_CSS_PATH, 'utf8');

  // Must declare min-width >= 44px
  assert.match(
    css,
    /\.btn-lang[^{]*\{[^}]*min-width:\s*(?:4[4-9]|[5-9]\d)px/,
    '.btn-lang must declare min-width: 44px (or greater) for touch target parity',
  );

  // Must declare min-height >= 44px
  assert.match(
    css,
    /\.btn-lang[^{]*\{[^}]*min-height:\s*(?:4[4-9]|[5-9]\d)px/,
    '.btn-lang must declare min-height: 44px (or greater) for touch target parity',
  );
});

test('navigation touch target: .brand declares at least 44px width and 44px height', () => {
  const css = readFileSync(SITE_CSS_PATH, 'utf8');

  // Must declare min-width >= 44px
  assert.match(
    css,
    /\.brand[^{]*\{[^}]*min-width:\s*(?:4[4-9]|[5-9]\d)px/,
    '.brand must declare min-width: 44px (or greater) for touch target parity',
  );

  // Must declare min-height >= 44px
  assert.match(
    css,
    /\.brand[^{]*\{[^}]*min-height:\s*(?:4[4-9]|[5-9]\d)px/,
    '.brand must declare min-height: 44px (or greater) for touch target parity',
  );
});

test('reflow: html root declares overflow-x: hidden to prevent document scroll bleed', () => {
  const css = readFileSync(SITE_CSS_PATH, 'utf8');
  assert.match(
    css,
    /html\s*\{[^}]*overflow-x:\s*hidden/,
    'html rule in site.css must declare overflow-x: hidden',
  );
});

test('reflow: carousel container enforces overflow containment for zoomed slide art', () => {
  const css = readFileSync(SITE_CSS_PATH, 'utf8');
  assert.match(
    css,
    /\.page-home\s+\.carousel[^{]*\{[^}]*overflow:\s*hidden/,
    '.page-home .carousel must declare overflow: hidden',
  );
});

test('reflow: footer links container declares flex-wrap: wrap for intermediate viewports', () => {
  const css = readFileSync(SITE_CSS_PATH, 'utf8');
  assert.match(
    css,
    /\.footlinks[^{]*\{[^}]*flex-wrap:\s*wrap/,
    '.footlinks rule in site.css must declare flex-wrap: wrap',
  );
  assert.match(
    css,
    /\.foot[^{]*\{[^}]*flex-wrap:\s*wrap/,
    '.foot rule in site.css must declare flex-wrap: wrap',
  );
});
