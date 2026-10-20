import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const manifestPath = 'release-manifests/VoidScriptor-1.2.0-rc.2-windows-x64.sha256';
const verifierPath = 'tools/verify-release.ps1';
const docsPath = 'docs/getting-started.html';

test('release manifest has a strict SHA-256 entry for the current installer', () => {
  const manifest = fs.readFileSync(manifestPath, 'utf8').trim();
  const match = manifest.match(/^([a-f0-9]{64})\s{1,2}\*?(VoidScriptor-1\.2\.0-rc\.2-windows-x64-setup\.exe)$/i);

  assert.ok(match, 'current installer manifest must contain one strict SHA-256 entry');
});

test('release verifier checks both checksum and Authenticode without claiming publisher trust', () => {
  const verifier = fs.readFileSync(verifierPath, 'utf8');

  assert.match(verifier, /Get-FileHash/);
  assert.match(verifier, /Get-AuthenticodeSignature/);
  assert.match(verifier, /HashMatchesManifest/);
  assert.match(verifier, /SignatureStatus/);
  assert.match(verifier, /publisher trust|SmartScreen/i);
  assert.doesNotMatch(verifier, /BEGIN (?:RSA |EC )?PRIVATE KEY|password\s*=|token\s*=/i);
});

test('technical evidence exposes the local release verification command', () => {
  const docs = fs.readFileSync(docsPath, 'utf8');
  const technical = fs.readFileSync('technical.html', 'utf8');
  const englishTechnical = fs.readFileSync('en/technical.html', 'utf8');

  assert.match(technical, /tools\/verify-release\.ps1/);
  assert.match(technical, /self-issued|self issued/i);
  assert.match(technical, /publisher.*tepercaya/i);
  assert.match(englishTechnical, /publisher.*trusted/i);
  assert.doesNotMatch(docs, /tools\/verify-release\.ps1/);
});
