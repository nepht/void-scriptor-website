import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const cases = [
  {
    page: 'tutorials.html',
    expected: 'Installer publik terverifikasi belum tersedia; gunakan <a href="/downloads">halaman unduhan</a> untuk memeriksa status sebelum mengikuti langkah instalasi.',
    stale: 'Ambil installer dari <a href="/downloads">halaman unduhan</a> di voidscriptor.com.',
  },
  {
    page: 'en/tutorials.html',
    expected: 'A verified public installer is not available yet; use the <a href="/en/downloads">downloads page</a> to check status before following installation steps.',
    stale: 'Take the installer from the <a href="/en/downloads">downloads page</a> on voidscriptor.com.',
  },
];

test('tutorial pages disclose pending public installer verification', () => {
  for (const { page, expected, stale } of cases) {
    const source = fs.readFileSync(page, 'utf8');
    assert.ok(source.includes(expected), `${page} must disclose pending installer availability`);
    assert.doesNotMatch(source, new RegExp(stale.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')), `${page} must not instruct a public download as available`);
  }
});
