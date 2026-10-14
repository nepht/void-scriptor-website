import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The docs hub is a directory index: `/docs/` resolves to `docs/index.html`
// and `/en/docs/` must resolve to `en/docs/index.html`. Both forward the
// visitor to the matching getting-started guide. The Indonesian hub shipped
// while the English one was missing, so `/en/docs/` and `/en/docs` fell
// through to the branded 404 even though `/docs/` returned 200 — a bilingual
// parity gap on a site whose whole /en/ tree mirrors the Indonesian pages.
//
// Before the fix, https://voidscriptor.com/en/docs/ returned the 404 page
// while https://voidscriptor.com/docs/ returned the redirect hub.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readHtml = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8');

// Emulate the Cloudflare Pages asset layer's directory-index resolution over
// the real publish tree so the worker's static pass-through is exercised end
// to end: a trailing-slash path serves `<dir>/index.html`, and a bare path
// serves the file itself or its directory index.
function assetsFromRepo() {
  return {
    fetch: async (request) => {
      const p = decodeURIComponent(new URL(typeof request === 'string' ? request : request.url).pathname);
      const candidates = p.endsWith('/') ? [`${p}index.html`] : [p, `${p}/index.html`];
      for (const c of candidates) {
        const fp = path.join(repoRoot, c.replace(/^\/+/, ''));
        if (existsSync(fp) && statSync(fp).isFile()) {
          const body = readFileSync(fp);
          const type = c.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream';
          return new Response(body, { status: 200, headers: { 'content-type': type } });
        }
      }
      return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain;charset=UTF-8' } });
    },
  };
}

test('both documentation hubs exist and forward to their getting-started guide', () => {
  const id = readHtml('docs/index.html');
  const en = readHtml('en/docs/index.html');

  assert.match(id, /<html lang="id">/, 'docs/index.html must declare lang="id"');
  assert.match(en, /<html lang="en">/, 'en/docs/index.html must declare lang="en"');

  assert.match(id, /http-equiv="refresh" content="0; url=\/docs\/getting-started"/,
    'docs/index.html must refresh to /docs/getting-started');
  assert.match(en, /http-equiv="refresh" content="0; url=\/en\/docs\/getting-started"/,
    'en/docs/index.html must refresh to /en/docs/getting-started');

  assert.match(id, /rel="canonical" href="https:\/\/voidscriptor\.com\/docs\/getting-started"/,
    'docs/index.html canonical must point at the Indonesian guide');
  assert.match(en, /rel="canonical" href="https:\/\/voidscriptor\.com\/en\/docs\/getting-started"/,
    'en/docs/index.html canonical must point at the English guide');

  assert.match(id, /location\.replace\('\/docs\/getting-started'/,
    'docs/index.html must redirect in JS to /docs/getting-started');
  assert.match(en, /location\.replace\('\/en\/docs\/getting-started'/,
    'en/docs/index.html must redirect in JS to /en/docs/getting-started');
});

test('the worker serves both documentation hub aliases from the publish tree', async () => {
  const { default: worker } = await import('../_worker.js');
  const env = { ASSETS: assetsFromRepo() };

  for (const [pathname, needle] of [
    ['/docs/', '/docs/getting-started'],
    ['/docs', '/docs/getting-started'],
    ['/en/docs/', '/en/docs/getting-started'],
    ['/en/docs', '/en/docs/getting-started'],
  ]) {
    const res = await worker.fetch(new Request(`https://voidscriptor.com${pathname}`), env);
    assert.equal(res.status, 200, `${pathname} must resolve to a documentation hub (200)`);
    const body = await res.text();
    assert.ok(body.includes(needle), `${pathname} must forward to ${needle}`);
  }
});

test('an unknown locale path still yields a 404, not a hub', async () => {
  const { default: worker } = await import('../_worker.js');
  const env = { ASSETS: assetsFromRepo() };
  const res = await worker.fetch(new Request('https://voidscriptor.com/en/nope/'), env);
  assert.equal(res.status, 404, '/en/nope/ must stay a miss');
});
