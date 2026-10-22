// Contract: the light theme's semantic ink colours must be referenced through
// tokens, not repeated as raw hex in rule bodies.
//
// A raw hex repeated across rules is a second source of truth: a future token
// change would move the declared token and leave the rules behind, which is
// how the homepage ended up overriding its own --ls-cyan with a hardcoded
// #006b84!important. This test locks the promotion so the token layer stays
// the single source for the values it owns.
//
// Token-block declarations are exempt: `body.theme-light{--ls-ink:#0b1b2b}`
// is where the value is DEFINED. Only values repeated in ordinary rule
// declarations are in scope.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const light = readFileSync(path.join(ROOT, 'assets', 'light.css'), 'utf8');
const withoutComments = light.replace(/\/\*[\s\S]*?\*\//g, '');

// raw hex -> the token that owns it
const OWNED = new Map([
  ['#3f2aa8', '--ls-violet-ink'],
  ['#41556b', '--ls-muted'],
  ['#0b1b2b', '--ls-ink'],
  ['#3c2a86', '--ls-violet-badge-ink'],
  ['#006b84', '--ls-cyan-label-ink'],
  ['#24176f', '--ls-violet-ink-hover'],
  ['#0a6f8c', '--ls-cyan-ink'],
]);

// Split the stylesheet into rules, dropping custom-property declarations so a
// token definition is not mistaken for a raw-hex usage.
const ruleBodies = [];
for (const match of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const selector = match[1].trim();
  const declarations = match[2].replace(/--[a-z0-9-]+\s*:[^;]+;?/gi, '');
  if (declarations.trim()) ruleBodies.push({ selector, declarations });
}

const declaredTokens = new Set(
  [...withoutComments.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]),
);

test('the light theme declares a token for every ink colour it reuses', () => {
  const missing = [];
  for (const [hex, token] of OWNED) {
    if (!declaredTokens.has(token)) missing.push(`${token} (for ${hex})`);
  }
  assert.deepEqual(missing, [], `light.css must declare: ${missing.join(', ')}`);
});

test('ink colours are referenced through tokens instead of repeated raw hex', () => {
  const offenders = [];
  for (const { selector, declarations } of ruleBodies) {
    for (const [hex, token] of OWNED) {
      const pattern = new RegExp(`${hex}\\b`, 'i');
      if (pattern.test(declarations)) {
        offenders.push(`${selector} uses raw ${hex} (should be var(${token}))`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `light theme ink colours must come from tokens:\n  ${offenders.join('\n  ')}`,
  );
});

test('the promoted tokens resolve to the exact hex values they replaced', () => {
  const tokenValue = (token) => {
    const m = withoutComments.match(new RegExp(`${token}\\s*:\\s*(#[0-9a-fA-F]{6})`));
    return m ? m[1].toLowerCase() : null;
  };
  for (const [hex, token] of OWNED) {
    assert.equal(
      tokenValue(token),
      hex,
      `${token} must resolve to ${hex}, got ${tokenValue(token)}`,
    );
  }
});
