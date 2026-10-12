import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// A Windows shell redirection slip (`dir ... 2> NUL`, `... > NUL`) can drop a
// file literally named NUL/CON/PRN/AUX/COM1/LPT1 into the publish root. Those
// names are reserved device names on Windows, so the file is always a stray
// tooling artifact, never site content. `wrangler pages deploy` uploads it and
// `.assetsignore` is not consulted on the Pages path, so the worker denylist is
// the only layer that keeps `/NUL` out of production. Before this guard,
// https://voidscriptor.com/NUL returned 200 application/octet-stream with 54
// bytes of findstr error text (verified live).

test('worker INTERNAL denylist covers Windows reserved device names', () => {
  const workerSource = fs.readFileSync('_worker.js', 'utf8');
  assert.ok(
    workerSource.includes('/^\\/(?:NUL|CON|PRN|AUX|COM[0-9]|LPT[0-9])$/i'),
    'the worker INTERNAL denylist must cover reserved device names such as /NUL',
  );
});

test('reserved device name paths are denied and never reach the asset store', async () => {
  const { default: worker } = await import('../_worker.js');
  const assetCalls = [];
  const env = {
    ASSETS: {
      fetch: async (request) => {
        const target = typeof request === 'string' ? request : request.url;
        assetCalls.push(new URL(target).pathname);
        return new Response('asset body', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        });
      },
    },
  };

  const denied = ['/NUL', '/nul', '/NUL?v=1', '/%4eUL', '/NUL/', '/CON', '/LPT1'];
  for (const path of denied) {
    const res = await worker.fetch(new Request(`https://voidscriptor.com${path}`), env);
    assert.equal(res.status, 404, `${path} must be denied by the worker denylist`);
    assert.equal(await res.text(), 'Not found');
  }

  // A normal route still flows through to the asset store untouched, and no
  // denied path was ever handed to it.
  const ok = await worker.fetch(new Request('https://voidscriptor.com/'), env);
  assert.equal(ok.status, 200);
  assert.equal(assetCalls.length, 1, 'only the non-denied path may reach the asset store');
  for (const path of denied) {
    assert.ok(!assetCalls.includes(path), `${path} must never reach the asset store`);
  }
});
