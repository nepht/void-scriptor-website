import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('dashboard uses plain language for Byte connection and account export status', () => {
  const source = fs.readFileSync('dashboard.html', 'utf8');
  const initialMarkup = source.slice(0, source.indexOf('var dict ='));

  assert.match(initialMarkup, /Koneksi Byte di komputer/);
  assert.match(initialMarkup, /Koneksi Byte belum aktif\?/);
  assert.match(source, /Data login rahasia, token, dan kode internal tidak disertakan\./);
  assert.match(source, /Koneksi Byte belum aktif di komputer ini\. Buka Byte Desktop, aktifkan koneksinya/);
  assert.doesNotMatch(source, /Byte Bridge belum terhubung di komputer ini/);
  assert.doesNotMatch(source, /aktifkan Bridge lokal/);
  assert.match(source, /dict\.id\['center-bridge-label'\]='Koneksi Byte di komputer'/);
  assert.match(source, /dict\.en\['center-bridge-label'\]='Byte connection on this computer'/);
  assert.doesNotMatch(source, /subject provider/);
  assert.doesNotMatch(source, /Provider lain/);
});
