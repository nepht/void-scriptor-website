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

// Walk the publish tree so a nested public page (e.g. docs/getting-started.html)
// cannot silently ship a social image without alt text. The previous version
// only scanned the root *.html plus en/index.html, which let docs/ slip through.
const SKIP_DIRS = new Set(['node_modules', '.git', '.wrangler', 'app', 'tools', 'test', 'migrations']);

function walkHtml(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walkHtml(dir === '.' ? entry.name : `${dir}/${entry.name}`, out);
    } else if (entry.name.endsWith('.html')) {
      out.push(dir === '.' ? entry.name : `${dir}/${entry.name}`);
    }
  }
  return out;
}

function publicPages() {
  return walkHtml('.', []).sort();
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

  // Nested public page: must carry Indonesian alt text like its sibling pages.
  const docs = fs.readFileSync('docs/getting-started.html', 'utf8');
  assert.match(meta(docs, 'property', 'og:image:alt'), /Alat nyata\. Status terbuka\./);
  assert.match(meta(docs, 'name', 'twitter:image:alt'), /Alat nyata\. Status terbuka\./);
});
