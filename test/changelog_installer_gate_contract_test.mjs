import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const idPage = fs.readFileSync('changelog.html', 'utf8');
const enPage = fs.readFileSync('en/changelog.html', 'utf8');
const downloads = fs.readFileSync('downloads.html', 'utf8');
const enDownloads = fs.readFileSync('en/downloads.html', 'utf8');

// 79d2c84 gated every installer CTA whose public availability is unverified;
// the changelog cards were missed and still link a file absent from the tree.
test('changelog pages keep the unverified installer gated like the downloads page', () => {
  for (const [page, gate] of [[idPage, 'Installer belum tersedia untuk diunduh'], [enPage, 'Installer is not available for download']]) {
    assert.doesNotMatch(page, /<a[^>]*href="\/downloads\/VoidScriptor-1\.2\.0-rc\.2-windows-x64-setup\.exe"[^>]*>/);
    assert.ok(page.includes(gate), `missing gated installer status: ${gate}`);
    assert.match(page, /belum diverifikasi live|has not been verified live/);
  }
});

test('gate wording stays aligned with the downloads pages', () => {
  assert.ok(downloads.includes('Installer belum tersedia untuk diunduh'));
  assert.ok(enDownloads.includes('Installer is not available for download'));
});

test('changelog checksum link to the tracked manifest remains', () => {
  for (const page of [idPage, enPage]) {
    assert.match(page, /href="\/release-manifests\/VoidScriptor-1\.2\.0-rc\.2-windows-x64\.sha256"/);
  }
});
