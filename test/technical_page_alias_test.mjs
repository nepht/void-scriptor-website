import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function assetsFromRepo() {
  return {
    fetch: async (request) => {
      const pathname = new URL(typeof request === 'string' ? request : request.url).pathname;
      const file = path.join(repoRoot, pathname.replace(/^\/+/, ''));
      if (existsSync(file) && statSync(file).isFile()) {
        return new Response(readFileSync(file), {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        });
      }
      return new Response('Not found', { status: 404 });
    },
  };
}

test('technical evidence pages resolve through their public aliases', async () => {
  const { default: worker } = await import('../_worker.js');
  const env = { ASSETS: assetsFromRepo() };
  for (const [route, title] of [
    ['/technical', 'Bukti teknis yang dapat diperiksa.'],
    ['/en/technical', 'Technical evidence you can check.'],
  ]) {
    const response = await worker.fetch(new Request(`https://voidscriptor.com${route}`), env);
    assert.equal(response.status, 200, route);
    assert.match(await response.text(), new RegExp(title));
  }
});
