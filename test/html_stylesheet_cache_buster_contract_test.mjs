// Contract: every tracked HTML stylesheet consumer uses the current CSS revisions.
// The Flutter shell under app/ is a generated deploy artifact and intentionally
// does not consume the website stylesheet pair.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const CURRENT = {
  site: 'dark-cosmic-20261024a',
  light: 'light-cosmic-20261024a',
};
const EXCLUDED_TRACKED_HTML = new Set(['app/index.html']);
// Redirect-only docs indexes intentionally load light.css for their minimal page;
// they do not consume the shared site.css runtime.
const LIGHT_ONLY_HTML = new Set(['docs/index.html', 'en/docs/index.html']);
const HTML_RE = /\.html$/i;
const LINK_RE = /<link\b[^>]*\bhref=["']([^"']*assets\/(?:site|light)\.css(?:\?[^"']*)?)["'][^>]*>/gi;

function trackedHtmlFiles(root = ROOT) {
  return execFileSync('git', ['ls-files', '*.html'], { cwd: root, encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((file) => HTML_RE.test(file) && !EXCLUDED_TRACKED_HTML.has(file));
}

function stylesheetRefs(html) {
  return [...html.matchAll(LINK_RE)].map(([, href]) => href);
}

export function validateTrackedHtmlConsumers(root = ROOT, files = trackedHtmlFiles(root), readText = (relative) => readFileSync(path.join(root, relative), 'utf8')) {
  const failures = [];
  const seen = new Set();
  for (const relative of files) {
    seen.add(relative);
    assert.ok(!path.isAbsolute(relative) && !relative.split(/[\\/]+/).includes('..'), `${relative}: HTML consumer must stay inside repository root`);
    const html = readText(relative);
    const refs = stylesheetRefs(html);
    const siteRefs = refs.filter((href) => /assets\/site\.css(?:\?|$)/.test(href));
    const lightRefs = refs.filter((href) => /assets\/light\.css(?:\?|$)/.test(href));
    const expectedSite = `assets/site.css?v=${CURRENT.site}`;
    const expectedLight = `assets/light.css?v=${CURRENT.light}`;

    assert.ok(refs.length > 0, `${relative}: missing tracked stylesheet consumer reference`);
    if (!LIGHT_ONLY_HTML.has(relative) && (siteRefs.length !== 1 || siteRefs[0] !== expectedSite && !siteRefs[0].endsWith(`/${expectedSite}`))) {
      failures.push(`${relative}: expected exactly one current site.css reference (${expectedSite}), got ${siteRefs.join(', ') || 'none'}`);
    }
    if (lightRefs.length !== 1 || lightRefs[0] !== expectedLight && !lightRefs[0].endsWith(`/${expectedLight}`)) {
      failures.push(`${relative}: expected exactly one current light.css reference (${expectedLight}), got ${lightRefs.join(', ') || 'none'}`);
    }
  }
  const actual = new Set(trackedHtmlFiles(root));
  const missing = [...actual].filter((file) => !seen.has(file));
  if (missing.length) failures.push(`unvalidated tracked HTML consumers: ${missing.join(', ')}`);
  assert.deepEqual(failures, [], failures.join('\n'));
  return { files: [...seen], stylesheetConsumers: seen.size };
}

test('tracked HTML consumers all use exactly one current site.css and light.css revision', () => {
  const result = validateTrackedHtmlConsumers();
  assert.ok(result.files.length > 1, 'derived tracked HTML set must not be empty or brittle');
});

test('RED witness: a missing consumer fails the cache-buster invariant', () => {
  const files = trackedHtmlFiles();
  assert.throws(
    () => validateTrackedHtmlConsumers(ROOT, files.slice(0, -1)),
    /unvalidated tracked HTML consumers/,
  );
});

test('RED witness: a stale cache token fails the cache-buster invariant', () => {
  const files = trackedHtmlFiles();
  const target = files.find((file) => !LIGHT_ONLY_HTML.has(file));
  const original = readFileSync(path.join(ROOT, target), 'utf8');
  const stale = original.replace(`site.css?v=${CURRENT.site}`, 'site.css?v=stale-token');
  assert.notEqual(stale, original, `${target} must contain the current site.css token for this witness`);
  assert.throws(
    () => validateTrackedHtmlConsumers(ROOT, [target], () => stale),
    /expected exactly one current site\.css reference/,
  );
});
