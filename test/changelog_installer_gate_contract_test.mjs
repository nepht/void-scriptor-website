import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const idPage = fs.readFileSync('changelog.html', 'utf8');
const enPage = fs.readFileSync('en/changelog.html', 'utf8');
const downloads = fs.readFileSync('downloads.html', 'utf8');
const enDownloads = fs.readFileSync('en/downloads.html', 'utf8');

test('changelog pages expose the live-verified installer', () => {
  for (const page of [idPage, enPage]) {
    assert.match(page, /<a[^>]*href="\/downloads\/VoidScriptor-1\.2\.0-rc\.2-windows-x64-setup\.exe"[^>]*>/);
    const currentCard = page.split("status-item status-item--current")[1].split("</article>")[0];
    assert.doesNotMatch(currentCard, /belum tersedia untuk diunduh|not available for download/);
  }
});

test('live availability wording stays aligned with the downloads pages', () => {
  assert.match(downloads, /Unduh installer/);
  assert.match(enDownloads, /Download installer/);
});

test('changelog checksum link to the tracked manifest remains', () => {
  for (const page of [idPage, enPage]) {
    assert.match(page, /href="\/release-manifests\/VoidScriptor-1\.2\.0-rc\.2-windows-x64\.sha256"/);
  }
});
