import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

// Social-card images must ship alt text. Screen readers and X's image
// fallback both rely on it: twitter:image:alt falls back to og:image:alt,
// so every page with a social image needs at least one of the two, and we
// pin both explicitly so neither platform depends on the fallback chain.
// Historically only /, /en/ and /quiz shipped og:image:alt; the remaining
// public pages exposed an image with no description at all.

function meta(html, attr, key) {
  const m = html.match(new RegExp(`<meta[^>]*${attr}=["']${key}["'][^>]*content=["']([^"']*)["']`, 'i'));
  return m && m[1];
}

function publicPages() {
  const pages = fs
    .readdirSync('.')
    .filter((f) => f.endsWith('.html'))
    .map((f) => f);
  if (fs.existsSync('en/index.html')) pages.push('en/index.html');
  return pages.sort();
}

test('every public page with a twitter:image also ships twitter:image:alt', () => {
  for (const page of publicPages()) {
    const html = fs.readFileSync(page, 'utf8');
    if (!meta(html, 'name', 'twitter:image')) continue;
    const alt = meta(html, 'name', 'twitter:image:alt');
    assert.ok(alt && alt.trim().length > 0, `${page} is missing a non-empty twitter:image:alt`);
  }
});

test('every public page with an og:image also ships og:image:alt', () => {
  for (const page of publicPages()) {
    const html = fs.readFileSync(page, 'utf8');
    if (!meta(html, 'property', 'og:image')) continue;
    const alt = meta(html, 'property', 'og:image:alt');
    assert.ok(alt && alt.trim().length > 0, `${page} is missing a non-empty og:image:alt`);
  }
});

test('image alt text matches the locale of its page', () => {
  const enAlt = meta(fs.readFileSync('en/index.html', 'utf8'), 'name', 'twitter:image:alt');
  assert.match(enAlt, /Real tools\. Honest status\./);

  const quizAlt = meta(fs.readFileSync('quiz.html', 'utf8'), 'name', 'twitter:image:alt');
  assert.match(quizAlt, /QOWNER/);

  const aboutAlt = meta(fs.readFileSync('about.html', 'utf8'), 'name', 'twitter:image:alt');
  assert.match(aboutAlt, /Alat nyata\. Status terbuka\./);
});
