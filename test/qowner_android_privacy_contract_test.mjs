import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pages = [
  ['ID', 'privacy.html'],
  ['EN', 'en/privacy.html'],
];

for (const [locale, path] of pages) {
  test(`${locale} privacy policy discloses Qowner Android processing`, async () => {
    const html = await readFile(path, 'utf8');

    assert.match(html, /<h3>Qowner Quiz Maker \(Android\)<\/h3>/);
    assert.match(html, /Firebase Authentication/);
    assert.match(html, /Cloud Firestore/);
    assert.match(html, /Cloud Functions/);
    assert.match(html, /leaderboard/i);
    assert.match(html, /delete|penghapusan/i);
    assert.match(html, /retained|disimpan/i);
    assert.match(html, /consent|persetujuan/i);
  });
}

test('privacy policy no longer claims Android is wholly unavailable', async () => {
  const id = await readFile('privacy.html', 'utf8');
  const en = await readFile('en/privacy.html', 'utf8');

  assert.doesNotMatch(id, /QOWNER iOS\/Android belum tersedia untuk diunduh/);
  assert.doesNotMatch(en, /QOWNER for iOS\/Android is not yet available for download/);
  assert.match(id, /belum dipublikasikan melalui Google Play/);
  assert.match(en, /has not been published through Google Play/);
});

test('privacy policy distinguishes absent analytics and crash SDKs', async () => {
  const id = await readFile('privacy.html', 'utf8');
  const en = await readFile('en/privacy.html', 'utf8');

  assert.match(id, /tidak menambahkan Firebase Analytics atau Firebase Crashlytics/);
  assert.match(en, /does not add Firebase Analytics or Firebase Crashlytics/);
});
