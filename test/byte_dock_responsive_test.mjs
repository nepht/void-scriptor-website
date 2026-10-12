import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

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
