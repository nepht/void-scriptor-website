import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync('en/index.html', 'utf8');

test('English homepage routes QOWNER archive CTA to the English quiz page', () => {
  assert.match(html, /href="\/en\/quiz" data-i18n="eco-qowner-cta"/);
  assert.doesNotMatch(html, /href="\/quiz" data-i18n="eco-qowner-cta"/);
});
