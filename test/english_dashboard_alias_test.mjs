import test from 'node:test';
import assert from 'node:assert/strict';

const { default: worker } = await import('../_worker.js');

function env() {
  return {
    ASSETS: {
      fetch: async () => new Response('asset body', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    },
  };
}

test('English dashboard aliases use the English auth notice instead of 404', async () => {
  for (const path of ['/en/dashboard', '/en/dashboard/', '/en/dashboard.html']) {
    const response = await worker.fetch(new Request(`https://voidscriptor.com${path}`), env());
    assert.equal(response.status, 302, `${path} should redirect when anonymous`);
    assert.equal(response.headers.get('location'), '/en/?auth=required');
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
});

test('normal dashboard keeps the Indonesian default notice', async () => {
  const response = await worker.fetch(new Request('https://voidscriptor.com/dashboard'), env());
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/?auth=required');
});
