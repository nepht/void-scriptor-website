import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// Every /en/ page is the English twin of an Indonesian page, so an English
// visitor must never be shown Indonesian copy or handed an Indonesian email
// subject. The marker-list check in `en_pages_contract_test.mjs` only scans a
// handful of literal phrases, which is exactly how `/en/contact` shipped
// `Permintaan data pribadi` and `Laporan pelanggaran hak cipta` as visible
// anchor text and as `mailto:` subjects for two FAQ entries. This test scans
// the two surfaces a visitor actually reads or sends (visible link text and
// mailto subject lines) against a word-boundary Indonesian denylist, so a new
// untranslated phrase fails here instead of slipping through a stale marker.

const EN_ROOT = 'en';

// Unambiguous Indonesian tokens. Each is either a function word or a domain
// word that has no legitimate reading in the English twins; ambiguous pairs
// ("status", "data", "informasi") are deliberately excluded to avoid false
// positives. Word boundaries keep "hapus" from matching an English substring.
const INDONESIAN_TOKENS = [
  'permintaan', 'laporan', 'pelanggaran', 'pribadi', 'unduh', 'unduhan',
  'masuk', 'daftar', 'catatan', 'kebijakan', 'syarat', 'kirim', 'laporkan',
  'kontak', 'tentang', 'kembali', 'beranda', 'simpan', 'hapus', 'bahasa',
  'diperbarui', 'rilis', 'pengaturan', 'pratinjau', 'berkas', 'tombol',
  'dasbor', 'panduan',
];
const ID_WORD = new RegExp(`(?<![a-zA-Z])(${INDONESIAN_TOKENS.join('|')})(?![a-zA-Z])`, 'i');

const stripTags = (s) => s.replace(/<[^>]+>/g, ' ');
const decode = (s) => {
  try { return decodeURIComponent(s); } catch { return s; }
};

function englishPages() {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.html')) out.push(full);
    }
  };
  walk(EN_ROOT);
  return out;
}

test('every /en/ page exists and the walk found the full twin set', () => {
  const pages = englishPages();
  assert.ok(pages.length >= 10, `expected the English twin set, found ${pages.length}`);
  for (const required of [
    'en/index.html', 'en/contact.html', 'en/privacy.html', 'en/terms.html',
    'en/downloads.html', 'en/docs/getting-started.html',
  ]) {
    assert.ok(pages.includes(required.split('/').join(path.sep)), `missing ${required}`);
  }
});

test('no English page hands the visitor an Indonesian mailto subject', () => {
  for (const file of englishPages()) {
    const html = fs.readFileSync(file, 'utf8');
    for (const m of html.matchAll(/mailto:[^"']*?\?subject=([^"'&]+)/g)) {
      const subject = decode(m[1]);
      assert.ok(
        !ID_WORD.test(subject),
        `${file} sends an Indonesian email subject: "${subject}"`,
      );
    }
  }
});

test('no English page shows Indonesian text inside a link', () => {
  for (const file of englishPages()) {
    const html = fs.readFileSync(file, 'utf8');
    for (const m of html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)) {
      const text = stripTags(m[1]).trim();
      assert.ok(
        !ID_WORD.test(text),
        `${file} shows Indonesian link text: "${text.slice(0, 80)}"`,
      );
    }
  }
});

test('/en/contact no longer carries the two FAQ phrases that regressed', () => {
  const html = fs.readFileSync('en/contact.html', 'utf8');
  for (const phrase of ['Permintaan data pribadi', 'Laporan pelanggaran hak cipta', 'Permintaan legal atau data']) {
    assert.ok(!html.includes(phrase), `en/contact.html still ships "${phrase}"`);
  }
  // The replacements must be the English wording, kept consistent with the
  // subject already used on the English terms page.
  assert.ok(html.includes('Personal%20data%20request'), 'en/contact.html needs the English data-request subject');
  assert.ok(html.includes('Copyright%20infringement%20report'), 'en/contact.html needs the English copyright subject');
});
