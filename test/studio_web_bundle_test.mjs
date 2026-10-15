import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

const read = (path) => fs.readFileSync(path, 'utf8');

test('public preview serves Studio assets through the worker without caching its entry or bundle', async () => {
  const { default: worker } = await import('../_worker.js');
  const fetched = [];
  const env = { ASSETS: { fetch: async (request) => {
    const path = new URL(request.url).pathname;
    fetched.push(path);
    return new Response(fs.readFileSync(`.${path}`), {
      headers: { 'content-type': path.endsWith('.json') ? 'application/json' : 'text/plain' },
    });
  } } };
  for (const [route, asset] of [['/preview/', '/preview-entry.txt'], ['/preview/version.json', '/app/version.json'], ['/preview/main.dart.js', '/app/main.dart.js']]) {
    const response = await worker.fetch(new Request(`https://voidscriptor.com${route}`), env);
    assert.equal(response.status, 200, route);
    assert.equal(fetched.at(-1), asset);
    assert.equal(response.headers.get('cache-control'), 'no-store', route);
    if (route === '/preview/') assert.match(response.headers.get('content-type'), /text\/html/);
    assert.equal(await response.text(), read(asset.slice(1)));
  }
});

test('Studio app and public preview identify the compiled product and use their own asset base', () => {
  for (const [file, base] of [['app/index.html', '/app/'], ['preview-entry.txt', '/preview/']]) {
    const html = read(file);
    assert.ok(html.includes(`<base href="${base}">`));
    assert.match(html, /<title>Void Scriptor Studio Preview<\/title>/);
    assert.match(html, /name="robots" content="noindex, nofollow"/);
    assert.doesNotMatch(html, /QOWNER/);
  }
  const manifest = JSON.parse(read('app/manifest.json'));
  assert.equal(manifest.name, 'Void Scriptor Studio Preview');
  assert.equal(manifest.start_url, '.');
});

test('published Studio bundle has verifiable source revision, version and file hashes', () => {
  const provenance = JSON.parse(read('app/build-info.json'));
  const version = JSON.parse(read('app/version.json'));
  assert.equal(version.app_name, 'void_scriptor');
  assert.equal(provenance.version, version.version);
  assert.match(provenance.sourceCommit, /^[a-f0-9]{40}$/);
  assert.equal(provenance.baseHref, '/app/');
  for (const name of ['main.dart.js', 'flutter_bootstrap.js', 'flutter_service_worker.js']) {
    assert.match(provenance.sha256[name], /^[a-f0-9]{64}$/);
    assert.equal(createHash('sha256').update(fs.readFileSync(`app/${name}`)).digest('hex'), provenance.sha256[name], name);
  }
  assert.match(read('app/flutter_service_worker.js'), /unregister\(/);
});
