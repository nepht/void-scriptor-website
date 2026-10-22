// Contract: the light theme must provide complete parity for all core dark-theme
// tokens, so that any shared, hybrid, or untransformed component on any page
// resolves readable light-cosmic ink and surfaces instead of leaking dark-mode values.
// Additionally, html background must be scoped to body.theme-light to prevent
// light canvas flash behind dark-theme overscroll.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const LIGHT_CSS_PATH = resolve(process.cwd(), 'assets/light.css');

test('theme parity: body.theme-light declares retuned dark palette variables in its root token block', () => {
  const css = readFileSync(LIGHT_CSS_PATH, 'utf8');

  // Extract the main body.theme-light block (before the first child selector)
  const match = css.match(/body\.theme-light\s*\{([\s\S]*?)\}/);
  assert.ok(match, 'must find root body.theme-light declaration block in light.css');
  const rootBlock = match[1];

  const requiredTokens = [
    '--void',
    '--abyss',
    '--obsidian',
    '--graphite',
    '--cloud',
    '--white',
    '--pure',
    '--ash',
    '--fog',
    '--silver',
    '--muted',
    '--faint',
    '--primary',
    '--primary-deep',
    '--primary-pale',
    '--violet',
    '--purple',
    '--purple-rgb',
    '--purple-soft',
    '--purple-bright',
    '--cyan',
    '--signal',
    '--line',
  ];

  for (const token of requiredTokens) {
    const regex = new RegExp(`${token}\\s*:`, 'i');
    assert.match(
      rootBlock,
      regex,
      `root body.theme-light block must retune ${token} for global light/dark parity`,
    );
  }
});

test('theme parity: html background is scoped to body.theme-light to prevent dark overscroll flash', () => {
  const css = readFileSync(LIGHT_CSS_PATH, 'utf8');
  assert.doesNotMatch(
    css,
    /^html\s*\{\s*background:\s*#f2f6fb\s*\}/m,
    'html background must not be an unscoped global rule affecting dark theme',
  );
  assert.match(
    css,
    /html:has\(body\.theme-light\)/,
    'html background must be scoped using :has(body.theme-light)',
  );
});
