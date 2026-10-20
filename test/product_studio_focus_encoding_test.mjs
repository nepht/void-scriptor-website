import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const pages = [
  { file: 'products.html', link: '<a href="/studio">Lihat cara kerja Studio \u2192</a>' },
  { file: 'en/products.html', link: '<a href="/en/studio">See how Studio works \u2192</a>' },
];

test('Studio focus links use a valid UTF-8 arrow, not mojibake', () => {
  for (const { file, link } of pages) {
    const html = fs.readFileSync(file, 'utf8');
    assert.ok(html.includes(link), `${file}: expected exact link ${link}`);
    assert.ok(!html.includes('\u00e2\u2020\u2019'), `${file}: double-encoded arrow still present`);
  }
});
