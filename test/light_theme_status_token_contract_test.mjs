// Contract: light-theme dashboard state colours must come from semantic tokens,
// not raw hex repeated across component rules.
//
// Token declarations are intentionally exempt. They are the source of truth;
// this contract rejects only duplicate raw values inside ordinary rule bodies.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const light = readFileSync(path.join(ROOT, 'assets', 'light.css'), 'utf8');
const withoutComments = light.replace(/\/\*[\s\S]*?\*\//g, '');

// raw hex -> semantic state token
const OWNED = new Map([
  ['#075c3f', '--ls-success-ink'],
  ['#e2f7ed', '--ls-success-surface'],
  ['#75c6a0', '--ls-success-border'],
  ['#7a3b12', '--ls-offline-ink'],
  ['#fff0e5', '--ls-offline-surface'],
  ['#d9a174', '--ls-offline-border'],
  ['#704b08', '--ls-warning-ink'],
  ['#fff7df', '--ls-warning-surface'],
  ['#d6b45a', '--ls-warning-border'],
  ['#8a2525', '--ls-danger-ink'],
  ['#fff1f1', '--ls-danger-surface'],
  ['#c77b7b', '--ls-danger-border'],
  ['#721c24', '--ls-danger-hover-ink'],
  ['#ffe4e4', '--ls-danger-hover-surface'],
  ['#a94b55', '--ls-danger-hover-border'],
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

test('the light theme declares every semantic dashboard state token', () => {
  const missing = [];
  for (const [hex, token] of OWNED) {
    if (!declaredTokens.has(token)) missing.push(`${token} (for ${hex})`);
  }
  assert.deepEqual(missing, [], `light.css must declare: ${missing.join(', ')}`);
});

test('dashboard state colours use tokens instead of duplicate raw hex', () => {
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
    `dashboard state colours must come from tokens:\n  ${offenders.join('\n  ')}`,
  );
});

test('state tokens preserve the exact colours they replace', () => {
  for (const [hex, token] of OWNED) {
    assert.equal(
      tokenValue(token),
      hex,
      `${token} must resolve to ${hex}, got ${tokenValue(token)}`,
    );
  }
});
