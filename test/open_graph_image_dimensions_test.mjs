import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

// Crawlers decide the social-card layout before they fetch the image, so an
// og:image without og:image:width/height is treated as unknown geometry: X
// falls back to the small summary card and several clients render a cropped
// or blank preview. Only /, /en/, /quiz and /en/quiz declared the dimensions,
// so the remaining eighteen sitemap routes advertised an image whose size
// nobody could know in advance.
//
// The expected numbers are read from the WebP header of the referenced asset
// rather than hardcoded, so replacing the artwork cannot leave the metadata
// quietly lying about it.

const ORIGIN = 'https://voidscriptor.com';

function sitemapPages() {
  const xml = fs.readFileSync('sitemap.xml', 'utf8');
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => {
    const path = match[1].replace(ORIGIN, '') || '/';
    const file = (path.endsWith('/') ? `${path}index.html` : `${path}.html`).replace(/^\//, '');
    return { url: match[1], file };
  });
}

function meta(html, attr, key) {
  const match = html.match(new RegExp(
    `<meta[^>]+${attr}=["']${key}["'][^>]+content=["']([^"']*)["']`, 'i',
  ));
  return match?.[1];
}

function webpSize(buffer) {
  assert.equal(buffer.toString('ascii', 0, 4), 'RIFF', 'social image must be a RIFF container');
  assert.equal(buffer.toString('ascii', 8, 12), 'WEBP', 'social image must be WebP');
  const chunk = buffer.toString('ascii', 12, 16);
  if (chunk === 'VP8X') {
    return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
  }
  if (chunk === 'VP8 ') {
    const frame = buffer.indexOf(Buffer.from([0x9d, 0x01, 0x2a]));
    assert.ok(frame > 0, 'VP8 frame header not found');
    return {
      width: buffer.readUInt16LE(frame + 3) & 0x3fff,
      height: buffer.readUInt16LE(frame + 5) & 0x3fff,
    };
  }
  if (chunk === 'VP8L') {
    const bits = buffer.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  throw new Error(`unsupported WebP chunk ${chunk}`);
}

test('every sitemap page declares og:image:width and og:image:height', () => {
  for (const { url, file } of sitemapPages()) {
    const html = fs.readFileSync(file, 'utf8');
    for (const key of ['og:image:width', 'og:image:height']) {
      const value = meta(html, 'property', key);
      assert.ok(value && /^\d+$/.test(value), `${url} is missing a numeric ${key}`);
    }
  }
});

test('declared og:image dimensions match the referenced asset', () => {
  for (const { url, file } of sitemapPages()) {
    const html = fs.readFileSync(file, 'utf8');
    const image = meta(html, 'property', 'og:image');
    assert.ok(image?.startsWith(`${ORIGIN}/`), `${url} og:image must be an absolute site URL`);

    const asset = image.replace(`${ORIGIN}/`, '');
    assert.ok(fs.existsSync(asset), `${url} og:image points at missing asset ${asset}`);

    const actual = webpSize(fs.readFileSync(asset));
    assert.equal(
      Number(meta(html, 'property', 'og:image:width')),
      actual.width,
      `${url} og:image:width disagrees with ${asset}`,
    );
    assert.equal(
      Number(meta(html, 'property', 'og:image:height')),
      actual.height,
      `${url} og:image:height disagrees with ${asset}`,
    );
  }
});

test('og:image:secure_url mirrors og:image wherever it is declared', () => {
  for (const { url, file } of sitemapPages()) {
    const html = fs.readFileSync(file, 'utf8');
    const secure = meta(html, 'property', 'og:image:secure_url');
    if (!secure) continue;
    assert.equal(secure, meta(html, 'property', 'og:image'), `${url} og:image:secure_url must mirror og:image`);
  }
});
