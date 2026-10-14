import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

// Every route listed in sitemap.xml is an indexable public surface, so it must
// carry a complete social card. The previous version of this test pinned a
// hardcoded list of the original twenty pages, which let the bilingual release
// index (/downloads, /en/downloads) ship with no Open Graph or Twitter Card
// metadata while every sibling page had a full block. Deriving the page list
// from the sitemap makes a newly published route fail loudly instead of
// slipping through a stale allowlist.

const ORIGIN = 'https://voidscriptor.com';

function sitemapPages() {
  const xml = fs.readFileSync('sitemap.xml', 'utf8');
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  return urls.map((url) => {
    const path = url.replace(ORIGIN, '') || '/';
    const file = (path.endsWith('/') ? `${path}index.html` : `${path}.html`).replace(/^\//, '');
    const english = path === '/en/' || path.startsWith('/en/');
    return {
      url,
      file,
      primary: english ? 'en_US' : 'id_ID',
      alternate: english ? 'id_ID' : 'en_US',
    };
  });
}

function meta(html, attr, key) {
  const match = html.match(new RegExp(
    `<meta[^>]+${attr}=["']${key}["'][^>]+content=["']([^"']*)["']`, 'i',
  ));
  return match?.[1];
}

test('every sitemap page declares matching Open Graph locales', () => {
  for (const { url, file, primary, alternate } of sitemapPages()) {
    const html = fs.readFileSync(file, 'utf8');
    assert.equal(meta(html, 'property', 'og:locale'), primary, `${url} primary locale`);
    assert.equal(meta(html, 'property', 'og:locale:alternate'), alternate, `${url} alternate locale`);
  }
});

test('every sitemap page ships a complete social card', () => {
  const required = [
    ['property', 'og:type'],
    ['property', 'og:url'],
    ['property', 'og:title'],
    ['property', 'og:description'],
    ['property', 'og:image'],
    ['property', 'og:image:alt'],
    ['name', 'twitter:card'],
    ['name', 'twitter:title'],
    ['name', 'twitter:description'],
    ['name', 'twitter:image'],
    ['name', 'twitter:image:alt'],
  ];

  for (const { url, file } of sitemapPages()) {
    const html = fs.readFileSync(file, 'utf8');
    for (const [attr, key] of required) {
      const value = meta(html, attr, key);
      assert.ok(value && value.trim().length > 0, `${url} is missing a non-empty ${key}`);
    }
  }
});
