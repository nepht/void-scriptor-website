// Contract: light-theme interaction hover states, badge accents, and code
// colours must be referenced through tokens, not raw hex in rule bodies.
//
// Token-block declarations are exempt because that is where the value is
// defined. Only raw hex in ordinary rule bodies is rejected.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const light = readFileSync(path.join(ROOT, 'assets', 'light.css'), 'utf8');
const withoutComments = light.replace(/\/\*[\s\S]*?\*\//g, '');

const OWNED = new Map([
  ['#4a2fb4', '--ls-violet-hover-deep'],
  ['#6a48d8', '--ls-violet-hover-2'],
  ['#16324d', '--ls-ink-hover'],
  ['#173a5e', '--ls-code-ink'],
  ['#5137b5', '--ls-violet-kicker-ink'],
  ['#0a5c3c', '--ls-status-pill-ink'],
  ['#dcf7ea', '--ls-status-pill-surface'],
  ['#07566e', '--ls-cyan-num-ink'],
  ['#f5f7ff', '--ls-stamp-ink'],
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

test('the light theme declares every interaction and badge token', () => {
  const missing = [];
  for (const [hex, token] of OWNED) {
    if (!declaredTokens.has(token)) missing.push(`${token} (for ${hex})`);
  }
  assert.deepEqual(missing, [], `light.css must declare: ${missing.join(', ')}`);
});

test('interaction and badge rules use tokens instead of raw hex', () => {
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
    `interaction and badge colours must come from tokens:\n  ${offenders.join('\n  ')}`,
  );
});

test('dash-local-status references existing token var(--cyan)', () => {
  const match = withoutComments.match(
    /body\.theme-light\.page-dashboard \.dash-local-status\s*\{([^}]+)\}/,
  );
  assert.ok(match, 'expected dash-local-status rule in light.css');
  assert.match(
    match[1],
    /var\(--(cyan|signal)\)/,
    'dash-local-status must reference var(--cyan) or var(--signal) instead of raw #087895',
  );
});

test('promoted interaction tokens resolve to the exact hex values they replaced', () => {
  for (const [hex, token] of OWNED) {
    assert.equal(
      tokenValue(token),
      hex,
      `${token} must resolve to ${hex}, got ${tokenValue(token)}`,
    );
  }
});
