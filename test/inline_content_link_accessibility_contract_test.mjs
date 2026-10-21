import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const css = fs.readFileSync(path.join(root, 'assets', 'site.css'), 'utf8');

for (const file of ['about.html', 'en/about.html']) {
  test(`${file} exposes the scoped about-page body hook`, () => {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(html, /<body class="page-about theme-light"/);
  });
}

test('inline content links have a non-color distinction', () => {
  assert.match(
    css,
    /\.page-about \.hero-card p a,\.page-legal p a,\.page-legal li a,\.page-contact p a,\.page-contact li a\{text-decoration:underline;text-underline-offset:3px\}/,
  );
});
