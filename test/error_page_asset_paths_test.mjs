import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// The branded 404 page is served by the worker at ANY unmatched path, so its
// markup must be path-independent: every asset reference has to be rooted at
// the site origin. A relative `src="assets/..."` resolved against a nested URL
// such as /foo/bar becomes /foo/assets/... and 404s, leaving a broken logo on
// the error page. dashboard.html is served the same way at /dashboard/ and
// /en/dashboard, where a relative reference resolves under /dashboard/ or /en/
// and misses the real asset.
//
// Before the fix, https://voidscriptor.com/foo/bar returned the 404 page whose
// only relative reference (the emblem <img>) resolved to a 404, while
// /assets/void_scriptor_emblem.webp itself returned 200.

const RELATIVE_ASSET_REF =
  /(?:src|href|srcset)=["'](?![/#]|https?:|mailto:|tel:|javascript:|data:)/g;

async function readHtml(rel) {
  return readFile(new URL(`../${rel}`, import.meta.url), 'utf8');
}

test('worker-served shells keep every asset reference rooted at the origin', async () => {
  for (const rel of ['404.html', 'dashboard.html', 'profile.html']) {
    const html = await readHtml(rel);
    const relative = html.match(RELATIVE_ASSET_REF) || [];
    assert.deepEqual(relative, [], `${rel} must not contain relative asset references`);
  }
});

test('the worker emits the 404 page for a nested path with no relative asset references', async () => {
  const { default: worker } = await import('../_worker.js');
  const real404 = await readHtml('404.html');
  const htmlResponse = (body, status) =>
    new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });

  const env = {
    ASSETS: {
      fetch: async (request) => {
        const path = new URL(typeof request === 'string' ? request : request.url).pathname;
        if (path === '/404.html') return htmlResponse(real404, 200);
        // Any other unmatched path is a miss, which drives the worker's
        // branded-404 branch.
        return htmlResponse('<!doctype html><title>missing</title>', 404);
      },
    },
  };

  const res = await worker.fetch(new Request('https://voidscriptor.com/foo/bar/baz'), env);
  assert.equal(res.status, 404);

  const body = await res.text();
  const relative = body.match(RELATIVE_ASSET_REF) || [];
  assert.deepEqual(relative, [], 'the served 404 page must not use relative asset references');
  assert.match(
    body,
    /<img class="logo" src="\/assets\/void_scriptor_emblem\.webp"/,
    'the 404 emblem must be an origin-rooted path so it resolves at any depth',
  );
});
