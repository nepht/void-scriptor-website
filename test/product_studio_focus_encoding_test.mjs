import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const pages = [
  { file: 'products.html', linkPattern: /href="\/studio"[^>]*>Lihat cara kerja Studio \u2192<\/a>/ },
  { file: 'en/products.html', linkPattern: /href="\/en\/studio"[^>]*>See how Studio works \u2192<\/a>/ },
];

test('Studio focus links use a valid UTF-8 arrow, not mojibake', () => {
  for (const { file, linkPattern } of pages) {
    const html = fs.readFileSync(file, 'utf8');
    assert.ok(linkPattern.test(html), `${file}: expected focus link with valid arrow`);
    assert.ok(!html.includes('\u00e2\u2020\u2019'), `${file}: double-encoded arrow still present`);
  }
});
