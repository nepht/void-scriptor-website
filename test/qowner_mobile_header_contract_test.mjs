import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pages = ['quiz.html', 'en/quiz.html'];

for (const page of pages) {
  test(`${page}: QOWNER mobile header has ordered account wrapper`, () => {
    const html = readFileSync(new URL(`../${page}`, import.meta.url), 'utf8');
    assert.match(html, /<div class="account quiz-account"/);
  });

  test(`${page}: QOWNER mobile menu uses light surface contract`, () => {
    const html = readFileSync(new URL(`../${page}`, import.meta.url), 'utf8');
    assert.match(html, /\.quiz-menu\{[^}]*background:rgba\(255,255,255,/s);
    assert.match(html, /\.quiz-menu\{[^}]*color:#13263d/s);
    assert.match(html, /header nav\.open\{[^}]*background:rgba\(255,255,255,/s);
    assert.match(html, /header nav\.open\{[^}]*color:#13263d/s);
  });
}
