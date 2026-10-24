import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const pages = ['index.html', 'en/index.html'];
const source = pages.map((page) => fs.readFileSync(page, 'utf8')).join('\n');

// Release state is now verified by the worker's live artifact HEAD, while the
// dictionary still carries the preview label and checksum instruction.

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
    assert.ok(html.includes("'plat-studio':'Installer available · preview · checksum published'"), `${page} must expose the English verified artifact status`);
    assert.ok(html.includes("'prod-studio-plat':'Windows · installer available; checksum published'"), `${page} must expose the English verified product status`);
    assert.ok(html.includes("'status-live':'RECORDED · RC.2 PREVIEW'"), `${page} must keep the English release state recorded`);
    assert.ok(html.includes("'status-live-desc':'Windows x64 · release candidate 1.2.0-rc.2 · installer available; checksum published'"), `${page} must expose the English verified release status`);
    assert.ok(html.includes("'plat-studio':'Installer tersedia · preview · checksum tersedia'"), `${page} must expose the Indonesian verified artifact status`);
    assert.ok(html.includes("'prod-studio-plat':'Windows · installer tersedia; checksum dipublikasikan'"), `${page} must expose the Indonesian verified product status`);
    assert.ok(html.includes("'status-live':'TERCATAT · RC.2 PREVIEW'"), `${page} must keep the Indonesian release state recorded`);
    assert.ok(html.includes("'status-live-desc':'Windows x64 · release candidate 1.2.0-rc.2 · installer tersedia; checksum dipublikasikan'"), `${page} must expose the Indonesian verified release status`);
  }
});
