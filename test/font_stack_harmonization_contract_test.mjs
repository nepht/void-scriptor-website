// Contract: font stack harmonization across assets/site.css and DESIGN.md.
// Sora, Albert Sans, and Inter form the core typography hierarchy:
// - Display: Sora -> Albert Sans -> Inter (editorial personality with geometric anchor)
// - Body: Albert Sans -> Inter (clean humanist reading texture grounded by Inter)
// - Monospace: JetBrains Mono -> ui-monospace -> Roboto Mono -> monospace

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const SITE_CSS_PATH = resolve(process.cwd(), 'assets/site.css');
const DESIGN_MD_PATH = resolve(process.cwd(), 'DESIGN.md');
const PARENT_DESIGN_MD_PATH = resolve(process.cwd(), '../DESIGN.md');

test('font stack: assets/site.css harmonizes Sora, Albert Sans, and Inter across display and body', () => {
  const css = readFileSync(SITE_CSS_PATH, 'utf8');

  // Display stack must include Sora, Albert Sans, Inter
  assert.match(
    css,
    /--font-display:\s*Sora\s*,\s*['"]?Albert Sans['"]?\s*,\s*Inter\b/,
    'site.css --font-display must include Sora, Albert Sans, and Inter in sequence',
  );

  // Body stack must include Albert Sans and Inter
  assert.match(
    css,
    /--font-body:\s*['"]?Albert Sans['"]?\s*,\s*Inter\b/,
    'site.css --font-body must include Albert Sans and Inter',
  );

  // Mono stack must include JetBrains Mono
  assert.match(
    css,
    /--font-mono:\s*['"]?JetBrains Mono['"]?\s*,/,
    'site.css --font-mono must include JetBrains Mono',
  );
});

test('font stack: DESIGN.md synchronizes with runtime typography tokens and hierarchy', () => {
  assert.ok(existsSync(DESIGN_MD_PATH), 'DESIGN.md must exist in site/');
  const md = readFileSync(DESIGN_MD_PATH, 'utf8');

  // Verify DESIGN.md documents the harmonized stack with Inter as core
  assert.match(
    md,
    /Inter/i,
    'DESIGN.md must reference Inter as core typography',
  );
  assert.match(
    md,
    /Sora/i,
    'DESIGN.md must document Sora in the display hierarchy',
  );
  assert.match(
    md,
    /Albert Sans/i,
    'DESIGN.md must document Albert Sans in the body hierarchy',
  );

  // Synchronize parent DESIGN.md if present
  if (existsSync(PARENT_DESIGN_MD_PATH)) {
    const parentMd = readFileSync(PARENT_DESIGN_MD_PATH, 'utf8');
    assert.match(parentMd, /Sora/i, 'root DESIGN.md must also document Sora');
    assert.match(parentMd, /Albert Sans/i, 'root DESIGN.md must also document Albert Sans');
  }
});
