import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const worker = fs.readFileSync('_worker.js', 'utf8');

test('worker caches only successful art/font binaries with the long policy', () => {
  assert.match(worker, /const CACHE_ART = \/\\\.\(\?:webp\|png\|jpe\?g\|svg\|gif\|ico\|avif\|woff2\?\|ttf\|otf\)\$\/i;/);
  assert.match(worker, /if \(CACHE_ART\.test\(pathname\)\) return 'public, max-age=86400, stale-while-revalidate=604800';/);
  assert.doesNotMatch(worker, /CACHE_STATIC/);
});

test('worker does not assign long cache policy to metadata extensions', () => {
  assert.doesNotMatch(worker, /const CACHE_STATIC =/);
  assert.match(worker, /if \(isHtml\) return 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400';/);
  assert.match(worker, /if \(res\.status === 200 && !cc && !preservesNoStore/);
});

test('static UI files revalidate instead of going uncached', () => {
  assert.match(worker, /const CACHE_UI = \/\\\.\(\?:css\|js\)\$\/i;/);
  assert.match(
    worker,
    /if \(!isHtml && !isPrivateBundle && CACHE_UI\.test\(pathname\)\) \{\s*headers\.set\('cache-control', 'public, max-age=0, must-revalidate'\);/,
  );
  // A stale stylesheet would outlive a deploy, so no cache-control VALUE may pin
  // it: assert against the values actually assigned, not against prose in a
  // comment (the rationale text legitimately mentions "immutable").
  const values = [...worker.matchAll(/'cache-control',\s*'([^']+)'/gi)].map((m) => m[1]);
  assert.ok(values.length >= 3, `expected cache-control assignments, found ${values.length}`);
  for (const value of values) {
    assert.doesNotMatch(value, /immutable/i, `cache-control must never be immutable: ${value}`);
  }
  assert.ok(values.includes('public, max-age=0, must-revalidate'), 'CSS/JS must revalidate');
});

test('the gated Flutter bundle and metadata stay no-store', () => {
  assert.match(
    worker,
    /const isPrivateBundle = pathname\.startsWith\('\/app\/'\) \|\| pathname\.startsWith\('\/preview\/'\);/,
  );
  // The no-store fallback must still cover HTML, the private routes and metadata.
  assert.match(
    worker,
    /else if \(isHtml \|\| \/\\\.\(\?:css\|js\|json\|txt\|xml\|webmanifest\)\$\/i\.test\(pathname\)\) \{\s*headers\.set\('cache-control', 'no-store'\);/,
  );
});
