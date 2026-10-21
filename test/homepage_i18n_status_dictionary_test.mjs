import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const pages = ['index.html', 'en/index.html'];
const source = pages.map((page) => fs.readFileSync(page, 'utf8')).join('\n');

test('homepage language dictionaries keep Studio status evidence-gated', () => {
  const stale = [
    'Installer live · preview',
    'Windows · installer live',
    'LIVE · RC.2 PREVIEW',
    'installer live',
    'TERSEDIA RECORDED · RC.2 PREVIEW',
  ];
  for (const phrase of stale) {
    assert.ok(!source.includes(phrase), `stale homepage dictionary claim: ${phrase}`);
  }

  for (const page of pages) {
    const html = fs.readFileSync(page, 'utf8');
    assert.ok(html.includes("'plat-studio':'Installer recorded · preview · live verification pending'"), `${page} must keep the English platform status cautious`);
    assert.ok(html.includes("'prod-studio-plat':'Windows · installer recorded; live verification pending'"), `${page} must keep the English product status cautious`);
    assert.ok(html.includes("'status-live':'RECORDED · RC.2 PREVIEW'"), `${page} must keep the English release state recorded`);
    assert.ok(html.includes("'status-live-desc':'Windows x64 · release candidate 1.2.0-rc.2 · installer not live-verified'"), `${page} must keep the English live-verification caveat`);
    assert.ok(html.includes("'plat-studio':'Installer tercatat · preview · verifikasi live belum tersedia'"), `${page} must keep the Indonesian platform status cautious`);
    assert.ok(html.includes("'prod-studio-plat':'Windows · installer tercatat; verifikasi live belum tersedia'"), `${page} must keep the Indonesian product status cautious`);
    assert.ok(html.includes("'status-live':'TERCATAT · RC.2 PREVIEW'"), `${page} must keep the Indonesian release state recorded`);
    assert.ok(html.includes("'status-live-desc':'Windows x64 · release candidate 1.2.0-rc.2 · installer belum diverifikasi live'"), `${page} must keep the Indonesian live-verification caveat`);
  }
});
