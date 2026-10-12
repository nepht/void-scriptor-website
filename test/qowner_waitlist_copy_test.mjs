import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync('quiz.html', 'utf8');

test('QOWNER waitlist copy matches the server-backed consent flow in both locales', () => {
  assert.match(source, /dict\.id\['waitlist-note'\]='Alamat disimpan untuk minat rilis QOWNER\. Anda dapat meminta penghapusan melalui Kontak; email otomatis belum dikirim\.'/);
  assert.match(source, /dict\.en\['waitlist-note'\]='The address is stored for QOWNER release interest\. You can request deletion through Contact; no automatic email is sent yet\.'/);
  assert.doesNotMatch(source, /waitlist-note[^\n]*Tombol ini membuka aplikasi email/);
  assert.match(source, /fetch\('\/api\/qowner\/waitlist',\{method:'POST'/);
});
