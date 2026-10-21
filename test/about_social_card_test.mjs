import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

// /about is a primary navigation page (linked from / and /en/) and must expose
// the same Twitter/X social-card metadata as every sibling page. Historically
// it shipped only Open Graph tags, so shares on X rendered as a bare link.

const OG_IMAGE = 'https://voidscriptor.com/assets/og-image.webp';

function meta(html, attr, key) {
  const m = html.match(new RegExp(`<meta[^>]*${attr}=["']${key}["'][^>]*content=["']([^"']*)["']`, 'i'));
  return m && m[1];
}

test('about page exposes complete Twitter/X social card metadata', () => {
  const html = fs.readFileSync('about.html', 'utf8');

  assert.equal(meta(html, 'name', 'twitter:card'), 'summary_large_image');
  assert.equal(meta(html, 'name', 'twitter:title'), 'Tentang platform : Void Scriptor');
  assert.equal(
    meta(html, 'name', 'twitter:description'),
    'Website dan platform yang dikelola oleh Choirudin.',
  );
  assert.equal(meta(html, 'name', 'twitter:image'), OG_IMAGE);
});

test('about page keeps its Open Graph tags alongside the Twitter card', () => {
  const html = fs.readFileSync('about.html', 'utf8');

  assert.equal(meta(html, 'property', 'og:url'), 'https://voidscriptor.com/about');
  assert.equal(meta(html, 'property', 'og:title'), 'Tentang platform : Void Scriptor');
  assert.equal(meta(html, 'property', 'og:image'), OG_IMAGE);
});
