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

test('dashboard light theme pairs readable ink with readable surfaces', () => {
  for (const selector of [
    'body.theme-light.page-dashboard .dash-center-card',
    'body.theme-light.page-dashboard .dash-center-auth',
    'body.theme-light.page-dashboard .dash-center-summary',
    'body.theme-light.page-dashboard .dash-command',
    'body.theme-light.page-dashboard .dash-settings-panel',
    'body.theme-light.page-dashboard .dash-center-card h2',
    'body.theme-light.page-dashboard .dash-center-copy',
    'body.theme-light.page-dashboard .dash-center-tabs a',
    'body.theme-light.page-dashboard .dash-op-diagnostics pre',
  ]) {
    assert.ok(light.includes(selector), `missing dashboard contrast rule: ${selector}`);
  }
  assert.ok(light.includes('background:var(--ls-glass)!important'), 'dashboard cards need a light readable surface');
  assert.ok(light.includes('color:var(--ls-ink)!important'), 'dashboard primary text needs dark readable ink');
});

test('dashboard light theme keeps per-panel surfaces and controls readable', () => {
  for (const selector of [
    'body.theme-light.page-dashboard main.dash::after{content:none!important}',
    'body.theme-light.page-dashboard .dash-sync-panel',
    'body.theme-light.page-dashboard .dash-activity-panel',
    'body.theme-light.page-dashboard .profile-field>span',
    'body.theme-light.page-dashboard .profile-field input',
    'body.theme-light.page-dashboard .session-info strong',
    'body.theme-light.page-dashboard .dash-provider-mark:not(.github){background:#1a73e8!important}',
    'body.theme-light.page-dashboard .dash-center-avatar i',
    'body.theme-light.page-dashboard .profile-status.ok',
    'body.theme-light.page-dashboard .dash-local-status',
  ]) {
    assert.ok(light.includes(selector), `missing round-2 dashboard contrast rule: ${selector}`);
  }
});
