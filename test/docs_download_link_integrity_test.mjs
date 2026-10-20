import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// The getting-started guide must keep release claims separate from live artifact proof.
// It may expose the checksum manifest, but not an installer download until availability is verified.

const docsPath = 'docs/getting-started.html';
const workerPath = '_worker.js';

const docs = fs.readFileSync(docsPath, 'utf8');
const worker = fs.readFileSync(workerPath, 'utf8');

test('getting started docs do not offer an unverified installer download', () => {
  assert.doesNotMatch(
    docs,
    /href="\/downloads\/VoidScriptor-1\.2\.0-rc\.2-windows-x64-setup\.exe"/i,
    'docs must not offer an installer download before live availability is verified',
  );
});

test('every /downloads/ link in the docs resolves to a worker allowlist entry', () => {
  const links = [...docs.matchAll(/href="\/downloads\/([^"]+)"/g)].map((m) => m[1]);
  assert.equal(links.length, 0, 'getting started must not expose unverified artifact downloads');
  assert.match(docs, /release-manifests\/VoidScriptor-1\.2\.0-rc\.2-windows-x64\.sha256/);

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
