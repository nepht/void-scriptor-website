// Contract: quiz.html and en/quiz.html hero headings (h1) must adapt responsively
// on mobile screens (<=600px) with appropriate line-height and margin between lines,
// preventing visual collisions between consecutive title lines.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

test('quiz pages mobile heading contract: responsive font-size and span margin to prevent collision', () => {
  for (const page of ['quiz.html', 'en/quiz.html']) {
    const html = readFileSync(join(ROOT, page), 'utf8');

    // Must define a mobile media query for h1 styling
    assert.match(
      html,
      /@media\s*\(max-width:\s*600px\)\s*\{[\s\S]*?h1\s*\{[^}]*font-size:\s*clamp\(28px,\s*7vw,\s*36px\)[^}]*line-height:\s*1\.15/,
      `${page} must define responsive clamp and line-height for h1 on mobile <=600px`,
    );

    // Must define span margin to ensure line separation
    assert.match(
      html,
      /@media\s*\(max-width:\s*600px\)\s*\{[\s\S]*?h1\s+span\s*\{[^}]*margin-bottom:\s*12px/,
      `${page} must define h1 span margin-bottom on mobile <=600px`,
    );
  }
});
