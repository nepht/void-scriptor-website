import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Byte idle launcher stays still and reduced motion disables every Byte animation', () => {
  const css = fs.readFileSync('assets/site.css', 'utf8');
  const idleRule = css.match(/\.byte-launcher-orb img\{([^}]+)\}/)?.[1];
  assert.ok(idleRule, 'launcher image rule must exist');
  assert.doesNotMatch(idleRule, /animation:[^;}]*(?:infinite|byteDockFloat)/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{\.byte-assistant,\.byte-assistant \*,\.byte-assistant \*::before,\.byte-assistant \*::after\{animation:none!important;transition:none!important\}/);
});

test('homepage Byte dock stays compact while closed and expands when opened', () => {
  const css = fs.readFileSync('assets/site.css', 'utf8');

  assert.match(
    css,
    /\.page-home \.byte-assistant:not\(\.is-open\)\{[^}]*width:62px/,
    'closed homepage Byte dock must stay compact',
  );
  assert.match(
    css,
    /\.page-home \.byte-assistant:not\(\.is-open\) \.byte-launcher-copy,[\s\S]*?\.page-home \.byte-assistant:not\(\.is-open\) \.byte-launcher \.byte-pulse\{display:none\}/,
    'closed compact Byte dock must hide decorative copy and pulse',
  );
});
