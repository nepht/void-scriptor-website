import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const cases = [
  {
    page: 'help.html',
    expected: 'Installer preview Studio tercatat, tetapi belum tersedia dari target publik yang terverifikasi.',
  },
  {
    page: 'en/help.html',
    expected: 'The Studio preview installer is recorded, but not yet available from a verified public target.',
  },
];

test('help pages do not claim an unverified installer is downloadable', () => {
  for (const { page, expected } of cases) {
    const source = fs.readFileSync(page, 'utf8');
    assert.ok(source.includes(expected), `${page} must state the verified availability limit`);
    assert.doesNotMatch(
      source,
      /(?:Installer preview Studio bisa diunduh|The Studio preview installer can be downloaded)/,
      `${page} must not claim the installer is downloadable`
    );
  }
});
