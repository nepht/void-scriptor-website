import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const pages = [
  'index.html',
  'en/index.html',
];

test('primary navigation is closed before JavaScript runs on both locales', () => {
  for (const page of pages) {
    const source = fs.readFileSync(page, 'utf8');
    const nav = source.match(/<nav\s+id="nav"[^>]*>/)?.[0] ?? '';

    assert.equal(nav, '<nav id="nav">', `${page}: expected a single primary navigation element`);
    assert.match(
      source,
      /body:not\(\.menu-ready\) #nav\{display:none!important\}/,
      `${page}: nav must stay hidden before the menu script is ready`,
    );
    assert.match(
      source,
      /function syncMenuLayout\(\)\{document\.body\.classList\.toggle\('menu-open',nav\.classList\.contains\('open'\)\)\}/,
      `${page}: menu state must stay synchronized`,
    );
    assert.match(
      source,
      /function resetMenu\(\)\{nav\.classList\.remove\('open'\);document\.body\.classList\.remove\('menu-open'\)\}/,
      `${page}: pageshow reset must close the menu`,
    );
    assert.match(source, /document\.body\.classList\.add\('menu-ready'\);/, `${page}: menu readiness must be explicit`);
  }
});
