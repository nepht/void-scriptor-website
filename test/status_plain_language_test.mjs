import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('status page uses Indonesian labels for technical evidence', () => {
  const source = fs.readFileSync('status.html', 'utf8');

  assert.match(source, /<span class="eyebrow">BUKTI TEKNIS<\/span>/);
  assert.match(source, /<h2 id="proof-title">Status produk dipisahkan dari bukti teknis\.<\/h2>/);
  assert.match(source, /href="\/technical">Bukti teknis dan batas rilis<\/a>/);
  assert.doesNotMatch(source, /Sidik jari file|Konfigurasi uji|Tanda tangan file|<h3>Keamanan<\/h3>/);
  assert.doesNotMatch(source, />EVIDENCE &amp; BATAS</);
  assert.doesNotMatch(source, /<h3>Requirements<\/h3>/);
  assert.doesNotMatch(source, /<h3>Signing<\/h3>/);
  assert.doesNotMatch(source, /<h3>Security<\/h3>/);
  assert.doesNotMatch(source, /provenance/);
  assert.doesNotMatch(source, /CORS wildcard/);
  assert.match(source, /TERCATAT · BELUM DIVERIFIKASI/);
  assert.match(source, /Ketersediaan publik installer Windows x64 belum diverifikasi lewat pemeriksaan live/);
});
