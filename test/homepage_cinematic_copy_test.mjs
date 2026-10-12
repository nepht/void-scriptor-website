import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('homepage uses a full-bleed cinematic stage without horizontal viewport hacks', () => {
  const css = fs.readFileSync('assets/site.css', 'utf8');

  assert.match(css, /\.page-home header\{[^}]*position:absolute/);
  assert.match(css, /\.page-home \.hero\{[^}]*min-height:100dvh/);
  assert.match(css, /\.page-home \.hero-inner\{[^}]*min-height:100dvh/);
  assert.match(css, /\.page-home \.caro-viewport\{[^}]*width:100%/);
  assert.match(css, /\.page-home \.caro-viewport\{[^}]*border-radius:0/);
  assert.match(css, /\.page-home \.caro-slide\{[^}]*min-height:clamp\([^}]*100dvh/);
  assert.doesNotMatch(css, /(?:^|[;{])\s*(?:width|inline-size):\s*100vw/);
  assert.match(css, /prefers-reduced-motion:reduce/);
});

test('technical documentation explains internal terms in plain language', () => {
  const docs = fs.readFileSync('docs/getting-started.html', 'utf8');
  const status = fs.readFileSync('status.html', 'utf8');
  const privacy = fs.readFileSync('privacy.html', 'utf8');
  const terms = fs.readFileSync('terms.html', 'utf8');

  assert.match(docs, /Status masuk dan laporan kesalahan/);
  assert.match(docs, /Cara masuk &amp; koneksi Byte/);
  assert.doesNotMatch(docs, /State autentikasi dan artefak diagnostik menggunakan direktori application-support/);
  assert.match(status, /Cara masuk Google\/GitHub/);
  assert.match(status, /server website dan file utama/);
  assert.doesNotMatch(status, /Ketersediaan provider/);
  assert.match(privacy, /basis data akun Cloudflare D1/);
  assert.match(privacy, /layanan login/);
  assert.match(terms, /layanan login/);
  assert.doesNotMatch(terms, /menghubungkan provider kedua/);
});
