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
