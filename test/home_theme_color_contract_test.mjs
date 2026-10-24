// Contract: the localized homepage advertises the dark cinematic surface by default
// while the shared theme bootstrap and toggle retain light-mode support.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pages = [
  ['index.html', 'id'],
  ['en/index.html', 'en'],
];

for (const [file, locale] of pages) {
  test(`${locale} homepage keeps dark default theme-color and light toggle`, () => {
    const html = readFileSync(file, 'utf8');
    assert.match(html, /<meta name="theme-color" content="#050507">/);
    assert.match(html, /id="btnTheme"/);
    assert.match(html, /localStorage\.getItem\("vs_theme"\)\|\|"dark"/);
    assert.match(html, /setAttribute\("content","#050507"\)/);
    assert.match(html, /assets\/theme\.js/);
  });
}
