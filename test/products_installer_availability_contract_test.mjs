import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const cases = [
  {
    page: 'products.html',
    expected: 'periksa statusnya di <a href="/downloads">halaman unduhan</a>',
    stale: 'langsung <a href="/downloads">ambil rilis yang bisa diverifikasi</a>',
  },
  {
    page: 'en/products.html',
    expected: 'check its status on the <a href="/en/downloads">downloads page</a>',
    stale: 'go straight to the <a href="/en/downloads">release you can verify</a>',
  },
];

test('product pages do not imply an unverified installer is ready to obtain', () => {
  for (const { page, expected, stale } of cases) {
    const source = fs.readFileSync(page, 'utf8');
    assert.ok(source.includes(expected), `${page} must direct users to status verification`);
    assert.ok(!source.includes(stale), `${page} must not imply a verified release is ready`);
  }
});
