import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const worker = fs.readFileSync('_worker.js', 'utf8');
const idPage = fs.readFileSync('downloads.html', 'utf8');
const enPage = fs.readFileSync('en/downloads.html', 'utf8');
const sitemap = fs.readFileSync('sitemap.xml', 'utf8');

test('download index pages exist in both locales and expose the verified installer', () => {
  for (const [page, language, link] of [[idPage, 'lang="id"', '/downloads/VoidScriptor-1.2.0-rc.2-windows-x64-setup.exe'], [enPage, 'lang="en"', '/downloads/VoidScriptor-1.2.0-rc.2-windows-x64-setup.exe']]) {
    assert.match(page, new RegExp(`<html ${language.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.match(page, new RegExp(`href="${link.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
    assert.match(page, /f53402cc84ab3e1e15d7870d4c408cb4f4eef7ebdb0487b79f56e56cddfe5ae6/);
  }
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
