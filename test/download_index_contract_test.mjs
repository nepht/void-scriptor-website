import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const worker = fs.readFileSync('_worker.js', 'utf8');
const idPage = fs.readFileSync('downloads.html', 'utf8');
const enPage = fs.readFileSync('en/downloads.html', 'utf8');
const idHome = fs.readFileSync('index.html', 'utf8');
const enHome = fs.readFileSync('en/index.html', 'utf8');
const sitemap = fs.readFileSync('sitemap.xml', 'utf8');
const installerPath = '/downloads/VoidScriptor-1.2.0-rc.2-windows-x64-setup.exe';
const checksum = 'f53402cc84ab3e1e15d7870d4c408cb4f4eef7ebdb0487b79f56e56cddfe5ae6';

test('localized download pages and home carousel expose the verified installer CTA', () => {
  for (const [page, language] of [[idPage, 'lang="id"'], [enPage, 'lang="en"']]) {
    assert.match(page, new RegExp(`<html ${language.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.match(page, /href="\/downloads\/VoidScriptor-1\.2\.0-rc\.2-windows-x64-setup\.exe"/);
    assert.doesNotMatch(page, /verifikasi live belum tersedia|live verification pending/);
    assert.match(page, new RegExp(checksum));
  }
  assert.match(idHome, /href="\/downloads\/VoidScriptor-1\.2\.0-rc\.2-windows-x64-setup\.exe" download/);
  assert.match(enHome, /href="\/downloads\/VoidScriptor-1\.2\.0-rc\.2-windows-x64-setup\.exe" download/);
  assert.doesNotMatch(idHome, /Periksa status unduhan/);
  assert.doesNotMatch(enHome, /Check download status/);
});

test('worker routes localized download indexes before artifact proxying', () => {
  assert.match(worker, /url\.pathname === '\/downloads' \|\| url\.pathname === '\/downloads\/'/);
  assert.match(worker, /url\.pathname === '\/en\/downloads' \|\| url\.pathname === '\/en\/downloads\/'/);
  assert.match(worker, /const downloadIndex = url\.pathname\.startsWith\('\/en\/'\) \? '\/en\/downloads\.html' : '\/downloads\.html'/);
});

test('download index routes are discoverable in sitemap', () => {
  assert.match(sitemap, /<loc>https:\/\/voidscriptor\.com\/downloads<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/voidscriptor\.com\/en\/downloads<\/loc>/);
});
