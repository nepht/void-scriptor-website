import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const idPage = fs.readFileSync('changelog.html', 'utf8');
const enPage = fs.readFileSync('en/changelog.html', 'utf8');
const downloads = fs.readFileSync('downloads.html', 'utf8');
const enDownloads = fs.readFileSync('en/downloads.html', 'utf8');

test('changelog pages expose the downloadable preview and its checksum', () => {
  for (const [page, path, label] of [[idPage, '/downloads/VoidScriptor-1.2.0-rc.2-windows-x64-setup.exe', 'Unduh installer Windows'], [enPage, '/downloads/VoidScriptor-1.2.0-rc.2-windows-x64-setup.exe', 'Download Windows installer']]) {
    const currentCard = page.split("status-item status-item--current")[1].split("</article>")[0];
    assert.ok(currentCard.includes(`href="${path}" download`), `${label} must point to the installer with download`);
    assert.match(currentCard, /Lihat checksum|View checksum/);
    assert.doesNotMatch(currentCard, /is-unavailable/);
    assert.match(currentCard, new RegExp(label));
  }
});

test('live availability wording stays aligned with the downloads pages', () => {
  assert.match(downloads, /tersedia sebagai release candidate.*Unduh installer/);
  assert.match(enDownloads, /is available as a Windows x64 release candidate.*Download the installer/);
});

test('changelog checksum link to the tracked manifest remains', () => {
  for (const page of [idPage, enPage]) {
    assert.match(page, /href="\/release-manifests\/VoidScriptor-1\.2\.0-rc\.2-windows-x64\.sha256"/);
  }
});
