import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('visible Byte copy does not expose the internal bridge name', () => {
  const homeId = fs.readFileSync('index.html', 'utf8');
  const homeEn = fs.readFileSync('en/index.html', 'utf8');
  const dashboard = fs.readFileSync('dashboard.html', 'utf8');
  const status = fs.readFileSync('status.html', 'utf8');

  assert.match(homeId, /workspaceError:'Aku belum bisa membaca workspace\. Pastikan koneksi Byte lokal aktif\./);
  assert.match(homeEn, /workspaceError:'I cannot read the workspace yet\. Make sure the local Byte connection is active\./);
  assert.doesNotMatch(homeId, /Pastikan Byte Bridge sedang aktif/);
  assert.doesNotMatch(homeEn, /Make sure Byte Bridge is running/);
  assert.match(dashboard, /'center-bridge-label':'Koneksi Byte di komputer'/);
  assert.match(dashboard, /'center-bridge-label':'Byte connection on this computer'/);
  assert.doesNotMatch(dashboard, /'center-bridge-label':'Byte Bridge lokal'/);
  assert.doesNotMatch(dashboard, /'center-bridge-label':'Local Byte Bridge'/);
  assert.match(status, /Koneksi Byte lokal memiliki daftar asal yang diizinkan/);
  assert.doesNotMatch(status, /Byte Bridge memiliki allowlist origin/);
});
