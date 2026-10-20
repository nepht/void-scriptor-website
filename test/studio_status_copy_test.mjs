import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Studio product pages do not imply live installer availability', () => {
  const id = fs.readFileSync('studio.html', 'utf8');
  const en = fs.readFileSync('en/studio.html', 'utf8');
  assert.match(id, /yang tercatat untuk release candidate ini, tetapi ketersediaannya belum diverifikasi live/);
  assert.match(en, /recorded for this release candidate, but its public availability has not been verified live/);
  assert.doesNotMatch(id, /Installer Windows x64 yang dipublikasikan untuk release candidate ini/);
  assert.doesNotMatch(en, /The Windows x64 installer published for this release candidate/);
});
