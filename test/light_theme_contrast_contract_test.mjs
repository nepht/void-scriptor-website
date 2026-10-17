// Contract: the light theme must keep readable text tokens and cache-busting.
//
// Regression guard for the dark-theme tokens that leaked into the light surface
// (white text on white cards) and for stylesheet cache versions going stale.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const light = readFileSync(join(ROOT, 'assets', 'light.css'), 'utf8');

const readHtmlFiles = (dir = ROOT, acc = []) => {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git' || entry === 'downloads') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      readHtmlFiles(full, acc);
    } else if (entry.endsWith('.html')) {
      acc.push(full);
    }
  }
  return acc;
};

test('light theme keeps dark ink tokens for text', () => {
  for (const token of ['--ls-ink:#0b1b2b', '--ls-muted:#41556b', '--ls-faint:#5c6f85']) {
    assert.ok(light.includes(token), `missing ${token}`);
  }
  for (const legacy of ['--cloud:#0b1b2b', '--white:#0b1b2b', '--pure:#0b1b2b', '--primary-pale:#3f2aa8']) {
    assert.ok(light.includes(legacy), `legacy dark token not retuned: ${legacy}`);
  }
  assert.ok(!/--cloud:#f5f5f7/.test(light), '--cloud must not stay near-white in light theme');
});

test('light theme hardens compact and dark-palette components', () => {
  for (const selector of [
    'body.theme-light .status-primary',
    'body.theme-light .presentation-switch__tab',
    'body.theme-light .proof-stamp',
    'body.theme-light.page-quiz .answer-toggle',
    'body.theme-light.page-home .gallery-note',
  ]) {
    assert.ok(light.includes(selector), `missing contrast rule: ${selector}`);
  }
  assert.ok(light.includes('color:#fff!important'), 'light buttons need explicit white text');
});

test('every page cache-busts the light stylesheet with one shared version', () => {
  const versions = new Set();
  for (const file of readHtmlFiles()) {
    const html = readFileSync(file, 'utf8');
    for (const match of html.matchAll(/light\.css\?v=([\w.-]+)/g)) {
      versions.add(match[1]);
    }
  }
  assert.equal(versions.size, 1, `mixed light.css versions: ${[...versions].join(', ')}`);
  const [version] = [...versions];
  assert.match(version, /^light-cosmic-\d{8}[a-z]$/, `unexpected cache version ${version}`);
});
