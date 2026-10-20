// Contract: the light theme's per-page overrides must actually reach the pages
// they were written for. A body.theme-light.page-X selector with no page
// carrying that class is dead, so its retune never renders; a page that ships
// a dark scrim must have a matching neutralizer or the light theme breaks.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const light = readFileSync(join(ROOT, 'assets', 'light.css'), 'utf8');

const readHtmlFiles = (dir = ROOT, acc = []) => {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git' || entry === 'downloads' || entry === 'work') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      readHtmlFiles(full, acc);
    } else if (entry.endsWith('.html')) {
      acc.push(full);
    }
  }
  return acc;
};

const bodyClasses = (file) => {
  const match = readFileSync(file, 'utf8').match(/<body[^>]*class="([^"]*)"/);
  return match ? match[1].split(/\s+/) : [];
};

test('every compound light-theme page selector matches at least one page', () => {
  const tokens = [...new Set([...light.matchAll(/body\.theme-light\.(page-[a-z0-9-]+)/g)].map((m) => m[1]))];
  assert.ok(tokens.length > 0, 'expected at least one compound page selector in light.css');
  const classes = readHtmlFiles().flatMap(bodyClasses);
  const dead = tokens.filter((token) => !classes.includes(token));
  assert.deepEqual(dead, [], `light.css overrides with no matching page body class: ${dead.join(', ')}`);
});

test('profile dark body scrim is neutralized in the light theme', () => {
  const profile = readFileSync(join(ROOT, 'profile.html'), 'utf8');
  assert.match(profile, /body::before/, 'profile scrim premise changed: no body::before found');
  assert.match(
    light,
    /body\.theme-light\.page-profile::before,\s*body\.theme-light\.page-profile::after\{background:none;content:none\}/,
    'missing page-profile scrim neutralizer in light.css'
  );
});

test('profile near-white copy literals are retuned for light surfaces', () => {
  for (const selector of ['body.theme-light.page-profile .bio', 'body.theme-light.page-profile .qowner']) {
    assert.ok(light.includes(selector), `missing light retune: ${selector}`);
  }
});
