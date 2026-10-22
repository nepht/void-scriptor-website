// Contract: homepage product cards (.eco-card) CTA links must provide
// an accessible touch target size (WCAG 2.5.8 Target Size Minimum >= 24px,
// and mobile touch recommendation >= 44px). Bare inline-block without
// min-height left .eco-cta at only 17px height on mobile screens.

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

test('.eco-cta in light.css declares an accessible touch target height (>= 44px)', () => {
  const css = readFileSync(path.join(siteRoot, 'assets', 'light.css'), 'utf8');
  const match = css.match(/body\.theme-light\s+\.eco-cta\{([^}]+)\}/);
  assert.ok(match, 'expected body.theme-light .eco-cta rule in light.css');
  const body = match[1];

  assert.match(
    body,
    /min-height:\s*(?:4[4-9]|[5-9]\d)px/,
    '.eco-cta must declare min-height: 44px (or greater) to satisfy touch target standards',
  );
  assert.match(
    body,
    /display:\s*inline-flex/,
    '.eco-cta should use inline-flex for vertical centering of text and arrow',
  );
});

test('all HTML pages referencing light.css use the updated cache version token', () => {
  const expectedToken = 'light.css?v=light-cosmic-20261022f';
  const htmlFiles = walkHtml(siteRoot);
  let checked = 0;
  for (const file of htmlFiles) {
    const html = readFileSync(file, 'utf8');
    if (!html.includes('assets/light.css')) continue;
    checked += 1;
    const rel = path.relative(siteRoot, file).replace(/\\/g, '/');
    assert.ok(
      html.includes(expectedToken),
      `${rel} must reference ${expectedToken}, found stale light.css query string`,
    );
  }
  assert.ok(checked >= 35, `expected at least 35 HTML files referencing light.css, found ${checked}`);
});
