import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Studio product pages reflect live installer availability', () => {
  const id = fs.readFileSync('studio.html', 'utf8');
  const en = fs.readFileSync('en/studio.html', 'utf8');
  assert.match(id, /yang tercatat untuk release candidate ini dan tersedia dari target publik/);
  assert.match(en, /recorded for this release candidate is available from the public target/);
  assert.doesNotMatch(id, /Installer belum tersedia untuk diunduh/);
  assert.doesNotMatch(en, /Installer is not available for download/);
  assert.doesNotMatch(id, /status-primary is-unavailable/);
  assert.doesNotMatch(en, /status-primary is-unavailable/);
});
