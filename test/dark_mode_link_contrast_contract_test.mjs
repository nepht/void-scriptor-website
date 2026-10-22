// Contract: text links and brand identifiers in dark mode must not fall back
// to browser default link blue (#0000ee on dark background = 2.11:1, failing WCAG AA).
// Header brand and body-level prose links must explicitly declare high-contrast
// ink tokens (--pure / --cloud / --primary-pale / --accent).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SITE_CSS_PATH = join(ROOT, 'assets', 'site.css');

test('dark mode brand styling contract: .brand and .brand span declare high-contrast ink', () => {
  const css = readFileSync(SITE_CSS_PATH, 'utf8');

  // .brand must not be default unstyled link blue
  assert.match(
    css,
    /\.brand\s*\{[^}]*color:\s*var\(--cloud\)/,
    'site.css must declare color: var(--cloud) on .brand',
  );
  assert.match(
    css,
    /\.brand\s+span\s*\{[^}]*color:\s*var\(--pure\)/,
    'site.css must declare color: var(--pure) on .brand span',
  );
});

test('dark mode inline prose link contract: legal/about/contact links declare accessible color', () => {
  const css = readFileSync(SITE_CSS_PATH, 'utf8');

  // Inline prose links in legal, about, and contact sections must declare color: var(--primary-pale) or var(--accent)
  assert.match(
    css,
    /\.page-about\s+\.hero-card\s+p\s+a,\.page-legal\s+p\s+a,\.page-legal\s+li\s+a,\.page-contact\s+p\s+a,\.page-contact\s+li\s+a\s*\{[^}]*color:\s*var\(--primary-pale\)/,
    'site.css inline links must declare color: var(--primary-pale) with >= 13:1 contrast on dark surfaces',
  );
});
