import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

// The worker owns every response, so a Pages asset never reaches the edge cache:
// each HTML request paid a full origin round trip even though the pages
// advertise `s-maxage=3600`. These tests drive the real worker with a stubbed
// ASSETS binding and a stub Cache API to prove the markup is now served from the
// colo cache, that a new deployment cannot serve the previous release's markup,
// and that the private/gated routes stay out of it.

const WORKER = pathToFileURL('D:/Project/Void Scriptor Website/site/_worker.js').href;

function makeCache() {
  const store = new Map();
  return {
    store,
    api: {
      async match(request) {
        const hit = store.get(request.url);
        return hit ? hit.clone() : null;
      },
      async put(request, response) {
        store.set(request.url, response.clone());
      },
    },
  };
}

function makeEnv({ sha = 'aaaaaaaaaaaa', body = '<!doctype html><title>Void Scriptor</title>', status = 200 } = {}) {
  const calls = [];
  return {
    calls,
    env: {
      CF_PAGES_COMMIT_SHA: sha,
      ASSETS: {
        async fetch(request) {
          const target = typeof request === 'string' ? request : request.url;
          calls.push(target);
          return new Response(body, {
            status,
            headers: { 'content-type': 'text/html; charset=utf-8' },
          });
        },
      },
    },
  };
}

function ctx() {
  const pending = [];
  return { pending, waitUntil(promise) { pending.push(promise); } };
}

const worker = (await import(WORKER)).default;

async function call(url, env, c) {
  const response = await worker.fetch(new Request(url), env, c);
  await Promise.all(c.pending);
  return response;
}

test('the first HTML request stores the markup and the next one is served from cache', async () => {
  const cache = makeCache();
  globalThis.caches = { default: cache.api };
  const { env, calls } = makeEnv();
  const c = ctx();

  const first = await call('https://voidscriptor.com/status', env, c);
  assert.equal(first.headers.get('x-vs-html-cache'), 'miss:aaaaaaa');
  assert.equal(calls.length, 1, 'the first request must reach the asset origin');

  const second = await call('https://voidscriptor.com/status', env, ctx());
  assert.equal(second.headers.get('x-vs-html-cache'), 'hit:aaaaaaa');
  assert.equal(calls.length, 1, 'the second request must not reach the asset origin');
  assert.equal(await second.text(), await first.text(), 'cached markup must match the original');
  assert.equal(second.headers.get('content-security-policy'), first.headers.get('content-security-policy'),
    'a cache hit must still carry the hardened security headers');
});

test('the root path is cached under the asset it actually resolves to', async () => {
  const cache = makeCache();
  globalThis.caches = { default: cache.api };
  const { env, calls } = makeEnv();
  await call('https://voidscriptor.com/', env, ctx());
  assert.ok(calls[0].endsWith('/index.html'), 'the root must resolve to /index.html');
  const again = await call('https://voidscriptor.com/', env, ctx());
  assert.equal(again.headers.get('x-vs-html-cache'), 'hit:aaaaaaa');
  assert.equal(calls.length, 1);
});

test('a new deployment never serves the previous release from cache', async () => {
  const cache = makeCache();
  globalThis.caches = { default: cache.api };

  const before = makeEnv({ sha: 'aaaaaaaaaaaa' });
  await call('https://voidscriptor.com/status', before.env, ctx());
  const warm = await call('https://voidscriptor.com/status', before.env, ctx());
  assert.equal(warm.headers.get('x-vs-html-cache'), 'hit:aaaaaaa');

  const after = makeEnv({ sha: 'bbbbbbbbbbbb', body: '<!doctype html><title>Void Scriptor v2</title>' });
  const fresh = await call('https://voidscriptor.com/status', after.env, ctx());
  assert.equal(fresh.headers.get('x-vs-html-cache'), 'miss:bbbbbbb', 'a new deploy id must miss the old entry');
  assert.equal(after.calls.length, 1);
  assert.match(await fresh.text(), /Void Scriptor v2/);
});

test('private, gated and manifest routes never enter the HTML cache', async () => {
  const cache = makeCache();
  globalThis.caches = { default: cache.api };
  const { env, calls } = makeEnv();

  for (const path of ['/profile', '/profile.html', '/app/index.html', '/release-manifests/x.sha256']) {
    const response = await call(`https://voidscriptor.com${path}`, env, ctx());
    assert.equal(response.headers.get('x-vs-html-cache'), 'bypass', `${path} must bypass the HTML cache`);
  }
  assert.equal(cache.store.size, 0, 'nothing may be stored for a bypassed route');
  assert.ok(calls.length >= 4);
});

test('the cache-status marker is attached to the reply, never stored', async () => {
  const cache = makeCache();
  globalThis.caches = { default: cache.api };
  const { env } = makeEnv();
  await call('https://voidscriptor.com/changelog', env, ctx());

  assert.equal(cache.store.size, 1);
  const stored = [...cache.store.values()][0];
  assert.equal(stored.headers.get('x-vs-html-cache'), null,
    'the stored copy must not carry the cache-status marker');
  assert.equal(stored.headers.get('cache-control'), 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400');
});

test('non-GET requests bypass the cache entirely', async () => {
  const cache = makeCache();
  globalThis.caches = { default: cache.api };
  const { env } = makeEnv();
  const response = await worker.fetch(new Request('https://voidscriptor.com/status', { method: 'HEAD' }), env, ctx());
  assert.equal(response.headers.get('x-vs-html-cache'), 'bypass');
  assert.equal(cache.store.size, 0);
});

test('a missing Cache API degrades to an uncached reply instead of a 500', async () => {
  const saved = globalThis.caches;
  delete globalThis.caches;
  try {
    const { env, calls } = makeEnv();
    const response = await call('https://voidscriptor.com/status', env, ctx());
    assert.equal(response.status, 200, 'a cache outage must not break a static page');
    assert.equal(response.headers.get('x-vs-html-cache'), 'bypass');
    assert.equal(calls.length, 1);
  } finally {
    globalThis.caches = saved;
  }
});
