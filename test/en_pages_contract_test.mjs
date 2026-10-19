import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

// The English homepage used to be the only /en/ page: its navigation linked
// straight at the Indonesian subpages, so an English visitor who clicked
// "About" or "Privacy" silently fell back to Indonesian content. Every public
// page now ships an English twin under /en/ with a reciprocal hreflang graph.
// This test locks that contract so a later edit cannot drop a page, its lang
// attribute, its canonical URL, or its alternates.

const PAGES = [
  'about',
  'byte',
  'changelog',
  'contact',
  'docs/getting-started',
  'help',
  'privacy',
  'products',
  'qowner',
  'quiz',
  'report-bug',
  'roadmap',
  'status',
  'studio',
  'terms',
  'tutorials',
];

const read = (p) => fs.readFileSync(p, 'utf8');
const canonical = (html) => (html.match(/<link rel="canonical" href="([^"]+)">/) || [])[1];
const alternates = (html) => Object.fromEntries(
  [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)].map((m) => [m[1], m[2]]),
);

for (const page of PAGES) {
  test(`/en/${page} ships an English twin with a complete hreflang graph`, () => {
    const enPath = `en/${page}.html`;
    assert.ok(fs.existsSync(enPath), `missing English page ${enPath}`);
    const en = read(enPath);
    assert.match(en, /<html lang="en">/, `${enPath} must declare lang="en"`);
    assert.equal(canonical(en), `https://voidscriptor.com/en/${page}`, `${enPath} canonical must point at the English URL`);
    const alt = alternates(en);
    assert.equal(alt.en, `https://voidscriptor.com/en/${page}`, `${enPath} must declare its own hreflang="en"`);
    assert.equal(alt.id, `https://voidscriptor.com/${page}`, `${enPath} must point hreflang="id" at the Indonesian page`);
    assert.equal(alt['x-default'], `https://voidscriptor.com/${page}`, `${enPath} must declare x-default`);

    // The Indonesian source must point back (reciprocal hreflang).
    const idPath = `${page}.html`;
    assert.ok(fs.existsSync(idPath), `missing Indonesian page ${idPath}`);
    const idAlt = alternates(read(idPath));
    assert.equal(idAlt.en, `https://voidscriptor.com/en/${page}`, `${idPath} must point hreflang="en" at the English twin`);
  });
}

test('English subpages carry no leftover Indonesian UI copy', () => {
  const markers = ['Lihat ', 'Silahkan', 'Hapus akun dan data server', 'studio independen yang dikelola', 'Note rilis', 'Catatan rilis'];
  for (const page of PAGES) {
    const html = read(`en/${page}.html`);
    const visible = html
      .replace(/<script[\s\S]*?<\/script>/g, '')
      .replace(/<style[\s\S]*?<\/style>/g, '');
    for (const marker of markers) {
      assert.ok(!visible.includes(marker), `en/${page}.html still shows Indonesian: "${marker}"`);
    }
  }
});

test('English subpages are listed in the sitemap', () => {
  const sitemap = read('sitemap.xml');
  for (const page of PAGES) {
    assert.ok(
      sitemap.includes(`<loc>https://voidscriptor.com/en/${page}</loc>`),
      `sitemap.xml is missing /en/${page}`,
    );
  }
});

test('English QOWNER page roots every site asset at the origin', () => {
  const html = read('en/quiz.html');
  for (const asset of [
    '/assets/void_scriptor_emblem.webp',
    '/assets/favicon-20261019.ico',
    '/assets/favicon-20261019-32.png',
    '/assets/favicon-20261019-16.png',
    '/assets/apple-touch-icon-20261019.png',
    '/site.webmanifest',
  ]) {
    assert.ok(
      html.includes(`href="${asset}"`) || html.includes(`href="${asset}?v=`) || html.includes(`src="${asset}"`),
      `en/quiz.html must use the root asset ${asset}`,
    );
  }
});

test('every page exposes a visible language switch', () => {
  for (const page of PAGES) {
    const idHtml = read(`${page}.html`);
    assert.ok(idHtml.includes('class="btn-lang"'), `${page}.html needs a language control`);
    assert.ok(
      idHtml.includes(`class="btn-lang" href="/en/${page}"`) || idHtml.includes('id="btnEN"'),
      `${page}.html needs a switch to English (link to /en/${page} or an in-place EN control)`,
    );
    const enHtml = read(`en/${page}.html`);
    assert.ok(enHtml.includes('class="btn-lang"'), `en/${page}.html needs a language control`);
    assert.ok(
      enHtml.includes(`class="btn-lang" href="/${page}"`) || enHtml.includes('id="btnID"'),
      `en/${page}.html needs a switch to Indonesian`,
    );
  }
});
