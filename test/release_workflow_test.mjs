import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflowPath = '.github/workflows/release-integrity.yml';
const assetsIgnorePath = '.assetsignore';

test('release integrity workflow runs on main release changes and manual dispatch', () => {
  const workflow = fs.readFileSync(workflowPath, 'utf8');

  assert.match(workflow, /name:\s*Release integrity/i);
  assert.match(workflow, /pull_request:[\s\S]*?branches:\s*\[main\]/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /branches:\s*\[main\]/);
  assert.match(workflow, /release-manifests\//);
  assert.match(workflow, /tools\/verify-release\.ps1/);
  assert.match(workflow, /'\*\*\/\*\.html'/);
  assert.match(workflow, /'assets\/\*\*'/);
  assert.match(workflow, /'_worker\.js'/);
  assert.match(workflow, /installer_url:/);
  assert.match(workflow, /runs-on: \${\{ inputs\.installer_url/);
  assert.match(workflow, /Invoke-WebRequest -Uri \$env:INSTALLER_URL/);
  assert.match(workflow, /VoidScriptor-1\.2\.0-rc\.2-windows-x64-setup\.exe/);
  assert.match(workflow, /-ManifestPath .*VoidScriptor-1\.2\.0-rc\.2-windows-x64\.sha256/);
  assert.match(workflow, /permissions:\s*\n\s+contents:\s+read/);
  assert.match(workflow, /npm ci --ignore-scripts/);
  assert.match(workflow, /node --test test\/\*\.mjs/);
});

test('release integrity workflow uses Node 24 GitHub Actions runtimes', () => {
  const workflow = fs.readFileSync(workflowPath, 'utf8');

  assert.match(workflow, /uses:\s*actions\/checkout@v7(?:\.|\s|$)/);
  assert.match(workflow, /uses:\s*actions\/setup-node@v7(?:\.|\s|$)/);
  assert.doesNotMatch(workflow, /uses:\s*actions\/(?:checkout|setup-node)@v4(?:\.|\s|$)/);
});

test('release integrity workflow cannot publish or consume signing secrets', () => {
  const workflow = fs.readFileSync(workflowPath, 'utf8');

  assert.doesNotMatch(workflow, /secrets\./i);
  assert.doesNotMatch(workflow, /wrangler\s+pages\s+deploy/i);
  assert.doesNotMatch(workflow, /git\s+push/i);
});

test('internal GitHub workflow files stay out of the Pages asset bundle', async () => {
  const assetsIgnore = fs.readFileSync(assetsIgnorePath, 'utf8');
  assert.match(assetsIgnore, /^\.github\/$/m);

  // `.assetsignore` is NOT consulted by `wrangler pages deploy` (the Pages
  // legacy path uses a hard-coded ignore list), so the worker denylist is the
  // layer that actually keeps CI files unreachable in production. Assert it in
  // source, then prove it behaviourally against the worker entry point.
  const workerSource = fs.readFileSync('_worker.js', 'utf8');
  assert.ok(
    workerSource.includes('/^\\/\\.github(?:\\/|$)/i'),
    'the worker INTERNAL denylist must cover the /.github tree',
  );

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

  for (const path of [
    '/.github/workflows/release-integrity.yml',
    '/.github/workflows/release-integrity.yml?v=1',
    '/.github/',
    '/%2egithub/workflows/release-integrity.yml',
  ]) {
    const res = await worker.fetch(new Request(`https://voidscriptor.com${path}`), env);
    assert.equal(res.status, 404, `${path} must be denied by the worker denylist`);
    assert.equal(await res.text(), 'Not found');
  }
  assert.deepEqual(assetCalls, [], 'denied paths must never reach the asset store');
});
