import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('dashboard has safe responsive contracts for tablet and mobile widths', () => {
  const css = fs.readFileSync('assets/site.css', 'utf8');

  assert.match(css, /@media\(max-width:900px\)\{[\s\S]*?\.page-dashboard \.dash-command\{grid-template-columns:1fr/);
  assert.match(css, /@media\(max-width:900px\)\{[\s\S]*?\.dash-readiness-grid\s*\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:760px\)\{[\s\S]*?\.dash-readiness-grid\s*\{grid-template-columns:1fr 1fr\}/);
  assert.match(css, /@media\(max-width:430px\)\{[\s\S]*?\.dash-readiness-grid\s*\{grid-template-columns:1fr\}/);
  assert.match(css, /\.page-dashboard \.dash-center-tabs[^\{]*\{[^}]*overflow-x:auto/);
  assert.match(css, /\.page-dashboard \.dash-center-tabs a\{[^}]*min-height:44px/);
  assert.match(css, /@media\(max-width:430px\)\{[\s\S]*?\.dash-command-actions\s*\{display:grid;grid-template-columns:1fr\}/);
  assert.match(css, /env\(safe-area-inset-(left|right|bottom)\)/);
});
