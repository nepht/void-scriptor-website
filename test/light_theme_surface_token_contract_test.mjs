// Contract: light-theme component surface tints, diagnostics ink, brand marks,
// and hero title gradient stops must be referenced through tokens.
//
// Token declarations are exempt because that is where values are defined.
// Only raw hex inside ordinary component rule bodies is rejected.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const light = readFileSync(path.join(ROOT, 'assets', 'light.css'), 'utf8');
const withoutComments = light.replace(/\/\*[\s\S]*?\*\//g, '');

const OWNED = new Map([
  ['#0a1a29', '--ls-hero-title-dark'],
  ['#3b23a8', '--ls-hero-title-mid'],
  ['#eaf5ff', '--ls-cyan-pale-soft'],
  ['#eef3f9', '--ls-carousel-bg'],
  ['#31527a', '--ls-carousel-arrow-ink'],
  ['#8a4a12', '--ls-report-warn-ink'],
  ['#eef4fb', '--ls-surface-tint'],
  ['#f1f5fb', '--ls-surface-tint-alt'],
  ['#164b5c', '--ls-diagnostics-ink'],
  ['#24292f', '--ls-brand-github'],
  ['#1a73e8', '--ls-brand-google'],
]);

const ruleBodies = [];
for (const match of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const selector = match[1].trim();
  const declarations = match[2].replace(/--[a-z0-9-]+\s*:[^;]+;?/gi, '');
  if (declarations.trim()) ruleBodies.push({ selector, declarations });
}

const declaredTokens = new Set(
  [...withoutComments.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]),
);

const tokenValue = (token) => {
  const match = withoutComments.match(
    new RegExp(`${token}\\s*:\\s*(#[0-9a-fA-F]{6})`),
  );
  return match ? match[1].toLowerCase() : null;
};

test('the light theme declares every component surface and brand token', () => {
  const missing = [];
  for (const [hex, token] of OWNED) {
    if (!declaredTokens.has(token)) missing.push(`${token} (for ${hex})`);
  }
  assert.deepEqual(missing, [], `light.css must declare: ${missing.join(', ')}`);
});

test('component surface rules use tokens instead of raw hex', () => {
  const offenders = [];
  for (const { selector, declarations } of ruleBodies) {
    for (const [hex, token] of OWNED) {
      if (new RegExp(`${hex}\\b`, 'i').test(declarations)) {
        offenders.push(`${selector} uses raw ${hex} (use var(${token}))`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `component surface and brand colours must come from tokens:\n  ${offenders.join('\n  ')}`,
  );
});

test('brand-hero-title gradient stops use tokens', () => {
  const match = withoutComments.match(
    /body\.theme-light \.brand-hero-title\s*\{([^}]+)\}/,
  );
  assert.ok(match, 'expected brand-hero-title rule in light.css');
  const decl = match[1];
  assert.match(
    decl,
    /var\(--ls-violet\)/,
    'brand-hero-title must reference var(--ls-violet) for #6b4bd6 stop',
  );
  assert.match(
    decl,
    /var\(--ls-cyan\)/,
    'brand-hero-title must reference var(--ls-cyan) for #0e8fb8 stop',
  );
});

test('promoted surface tokens resolve to the exact hex values they replaced', () => {
  for (const [hex, token] of OWNED) {
    assert.equal(
      tokenValue(token),
      hex,
      `${token} must resolve to ${hex}, got ${tokenValue(token)}`,
    );
  }
});
