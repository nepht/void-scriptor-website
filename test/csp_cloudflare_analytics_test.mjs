import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

// The site CSP is deliberately strict because our pages are self-contained.
// Cloudflare's edge injects the Web Analytics beacon (beacon.min.js from
// static.cloudflareinsights.com, reporting to cloudflareinsights.com) into HTML
// responses, so a policy that omits those origins logs a CSP violation on every
// page load and throws the analytics away. This test pins the two allowances
// that keep the beacon working, and pins the hardening directives so widening
// one thing cannot quietly relax another.

function siteDirectives() {
  const src = fs.readFileSync('_worker.js', 'utf8');
  const block = src.match(/const CSP_SITE = \[([\s\S]*?)\]\.join/);
  assert.ok(block, 'CSP_SITE must stay declared as a joined array in _worker.js');
  const entries = [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(entries.length > 0, 'CSP_SITE must not be empty');
  const map = {};
  for (const entry of entries) {
    const [name, ...values] = entry.split(' ');
    assert.equal(map[name], undefined, `CSP_SITE must not repeat the ${name} directive`);
    map[name] = values;
  }
  return map;
}

test('the site CSP allows the Cloudflare Web Analytics beacon the edge injects', () => {
  const csp = siteDirectives();
  assert.ok(csp['script-src'].includes('https://static.cloudflareinsights.com'),
    'script-src must allow static.cloudflareinsights.com or the beacon is blocked on every page');
  assert.ok(csp['connect-src'].includes('https://cloudflareinsights.com'),
    'connect-src must allow cloudflareinsights.com or the beacon cannot report');
});

test('the beacon allowance does not widen anything else', () => {
  const csp = siteDirectives();
  assert.ok(csp['script-src'].includes("'self'"));
  assert.ok(!csp['script-src'].includes('*'), 'script-src must never fall back to a wildcard');
  assert.ok(!csp['default-src'].includes('*'), 'default-src must never fall back to a wildcard');
  assert.deepEqual(csp['object-src'], ["'none'"]);
  assert.deepEqual(csp['frame-ancestors'], ["'none'"]);
  assert.deepEqual(csp['base-uri'], ["'self'"]);
});

test('the sign-in provider allowances survive alongside the beacon', () => {
  const csp = siteDirectives();
  assert.ok(csp['img-src'].includes('https://avatars.githubusercontent.com'));
  assert.ok(csp['img-src'].includes('https://lh3.googleusercontent.com'));
  assert.ok(csp['form-action'].includes('https://github.com'));
});
