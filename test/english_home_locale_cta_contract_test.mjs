import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync('en/index.html', 'utf8');

test('English homepage routes Studio and preview CTAs to the English downloads page', () => {
  assert.match(html, /href="\/en\/downloads" data-i18n="eco-studio-cta"/);
  assert.match(html, /href="\/en\/downloads" data-i18n="hero-cta"/);
  assert.doesNotMatch(html, /href="\/downloads" data-i18n="(?:eco-studio-cta|hero-cta)"/);
});
