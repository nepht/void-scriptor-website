import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// The getting-started docs page is the public release trust surface. It must not
// advertise a download that the worker refuses to serve. Commit 5582941 retired
// the portable ZIP from PUBLIC_DOWNLOAD_KEYS (only signed `.exe` installers are
// served now), but the docs page kept a primary "Unduh portable ZIP" CTA to
// /downloads/voidscriptor-1.2.0-rc.1-windows-x64.zip, which returned 404 live.
// This test pins the page to the served surface so the dead link cannot return.

const docsPath = 'docs/getting-started.html';
const workerPath = '_worker.js';

const docs = fs.readFileSync(docsPath, 'utf8');
const worker = fs.readFileSync(workerPath, 'utf8');

test('getting started docs no longer link the retired portable ZIP download', () => {
  assert.doesNotMatch(
    docs,
    /href="\/downloads\/voidscriptor-1\.2\.0-rc\.1-windows-x64\.zip"/i,
    'docs must not offer a /downloads/ link the worker no longer serves',
  );
});

test('every /downloads/ link in the docs resolves to a worker allowlist entry', () => {
  const links = [...docs.matchAll(/href="\/downloads\/([^"]+)"/g)].map((m) => m[1]);
  assert.ok(links.length > 0, 'docs must still offer at least the installer download');

  const allow = new Set(
    [...worker.matchAll(/'([^']+-windows-x64-setup\.exe)'/g)].map((m) => m[1]),
  );
  const signedRe = /^releases\/windows\/v\d+\.\d+\.\d+-rc\.\d+\/VoidScriptor-v\d+\.\d+\.\d+-rc\.\d+-windows-x64-signed\.exe$/i;

  for (const key of links) {
    assert.ok(
      allow.has(key) || signedRe.test(key),
      `docs download link "${key}" is not served by the worker allowlist`,
    );
  }
});
