import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const worker = fs.readFileSync('_worker.js', 'utf8');

test('download worker allows only versioned signed Windows handoff bundles', () => {
  assert.match(
    worker,
    /releases\\\/windows\\\/v\\d\+\\\.\\d\+\\\.\\d\+-rc\\\.\\d\+\\\/VoidScriptor-v\\d\+\\\.\\d\+\\\.\\d\+-rc\\\.\\d\+-windows-x64-signed\\\.zip/i,
  );
  assert.match(worker, /function isPublicDownloadKey\(key\)/);
  assert.match(worker, /isPublicDownloadKey\(key\)/);
  assert.doesNotMatch(worker, /DOWNLOADS\.get\(key\)\s*;[\s\S]{0,120}PUBLIC_DOWNLOAD_KEYS/);
});

