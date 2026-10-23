// Contract: legal and product detail pages must not push the document wider
// than a 320px viewport (WCAG 1.4.10 Reflow). An unbreakable long heading word
// (e.g. 'menggantikan.' on byte.html) at a rigid 44px minimum clamp forces
// horizontal scroll on narrow mobile screens. .page-legal h1 must allow fluid
// scaling down to narrow screens and declare overflow-wrap: anywhere.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const siteRoot = fileURLToPath(new URL('..', import.meta.url));

function walkHtml(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (['.git', '.wrangler', 'node_modules', 'work', 'test'].includes(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walkHtml(full, acc);
    else if (entry.endsWith('.html')) acc.push(full);
  }
  return acc;
}

test('.page-legal h1 rule supports fluid scaling and word wrapping for 320px viewports', () => {
  const css = readFileSync(path.join(siteRoot, 'assets', 'site.css'), 'utf8');
  const ruleMatch = css.match(/\.page-legal h1\{([^}]*)\}/);
  assert.ok(ruleMatch, 'site.css must declare a .page-legal h1 rule');
  const body = ruleMatch[1];
  
  // Must allow overflow wrapping so long words do not cause reflow failures
  assert.match(
    body,
    /overflow-wrap:\s*(anywhere|break-word)/,
    '.page-legal h1 must specify overflow-wrap: anywhere to prevent 320px viewport overflow',
  );
  
  // Must scale below 44px on narrow screens
  assert.match(
    body,
    /font-size:\s*clamp\(\s*(?:[12]\d|3[0-4])px/,
    '.page-legal h1 clamp minimum must not exceed 34px',
  );
});

test('site.css has a narrow mobile query scaling .page-legal h1 for small devices', () => {
  const css = readFileSync(path.join(siteRoot, 'assets', 'site.css'), 'utf8');
  assert.match(
    css,
    /@media\s*\(\s*max-width:\s*(?:4[0-8]\d|5[0-6]\d)px\s*\)[\s\S]*?\.page-legal h1\{[^}]*font-size:\s*clamp\(\s*(?:1\d|2[0-8])px/,
    'site.css must provide a narrow-screen query scaling .page-legal h1 down to <= 28px',
  );
});

test('all HTML pages referencing site.css use the updated cache version token', () => {
  const expectedToken = 'site.css?v=dark-cosmic-20261023a';
  const htmlFiles = walkHtml(siteRoot);
  let checked = 0;
  for (const file of htmlFiles) {
    const html = readFileSync(file, 'utf8');
    if (!html.includes('assets/site.css')) continue;
    checked += 1;
    const rel = path.relative(siteRoot, file).replace(/\\/g, '/');
    assert.ok(
      html.includes(expectedToken),
      `${rel} must reference ${expectedToken}, found stale site.css query string`,
    );
  }
  assert.ok(checked >= 35, `expected at least 35 HTML files referencing site.css, found ${checked}`);
});
