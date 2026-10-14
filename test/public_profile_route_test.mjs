import test from 'node:test';
import assert from 'node:assert/strict';

const { default: worker } = await import('../_worker.js');

function env() {
  const assetCalls = [];
  return {
    assetCalls,
    ASSETS: {
      fetch: async (request) => {
        assetCalls.push(new URL(typeof request === 'string' ? request : request.url).pathname);
        return new Response('<!doctype html><title>profile shell</title>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        });
      },
    },
  };
}

test('public profile routes accept canonical handles case-insensitively and with a trailing slash', async () => {
  for (const path of ['/u/Alice', '/u/ALICE/']) {
    const runtime = env();
    const response = await worker.fetch(new Request(`https://voidscriptor.com${path}`), runtime);
    assert.equal(response.status, 200, path);
    assert.deepEqual(runtime.assetCalls, ['/profile.html'], path);
  }
});

test('public profile routes reject malformed handles before reading assets', async () => {
  const runtime = env();
  const response = await worker.fetch(new Request('https://voidscriptor.com/u/ab'), runtime);
  assert.equal(response.status, 404);
  assert.deepEqual(runtime.assetCalls, []);
});
