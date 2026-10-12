import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('status page uses Indonesian labels for technical evidence', () => {
  const source = fs.readFileSync('status.html', 'utf8');

  assert.match(source, /<span class="eyebrow">BUKTI &amp; BATAS<\/span>/);
  assert.match(source, /<h3>Sidik jari file \(SHA-256\)<\/h3>/);
  assert.match(source, /<h3>Konfigurasi uji<\/h3>/);
  assert.match(source, /<h3>Tanda tangan file<\/h3>/);
  assert.match(source, /<h3>Keamanan<\/h3>/);
  assert.match(source, /asal file/);
  assert.match(source, /diterbitkan sendiri/);
  assert.match(source, /tidak menerima permintaan dari semua asal secara bebas/);
  assert.doesNotMatch(source, />EVIDENCE &amp; BATAS</);
  assert.doesNotMatch(source, /<h3>Requirements<\/h3>/);
  assert.doesNotMatch(source, /<h3>Signing<\/h3>/);
  assert.doesNotMatch(source, /<h3>Security<\/h3>/);
  assert.doesNotMatch(source, /provenance/);
  assert.doesNotMatch(source, /CORS wildcard/);
});
