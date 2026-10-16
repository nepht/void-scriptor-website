import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

// A long, unbreakable command string inside a bare <pre> pushes the whole
// document wider than the viewport: on a 390px screen the tutorials page grew
// to scrollWidth 577 while the client width stayed 390, because `overflow-x`
// on a plain <pre> is `visible`. `.docs-command pre` carries `overflow: auto`,
// so a code block is only safe when it sits inside that wrapper. This test
// locks the wrapper in place so a later edit cannot reintroduce the overflow.

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

const SECTION_RE = /<section class="([^"]*\bdocs-section\b[^"]*)"[^>]*>([\s\S]*?)<\/section>/g;

test('a code block inside a docs section is wrapped in a scrollable container', () => {
  let codeBlocks = 0;
  for (const file of walkHtml(siteRoot)) {
    const rel = path.relative(siteRoot, file).replace(/\\/g, '/');
    const html = readFileSync(file, 'utf8');
    for (const [, cls, inner] of html.matchAll(SECTION_RE)) {
      if (!inner.includes('<pre')) continue;
      codeBlocks += 1;
      assert.ok(
        inner.includes('class="docs-command"'),
        `${rel} has a <pre> in a docs section (${cls.trim()}) with no .docs-command wrapper; `
        + 'a plain <pre> keeps overflow-x visible and widens the page on narrow screens',
      );
    }
  }
  assert.ok(codeBlocks >= 4, `expected the documented code blocks to be checked, found ${codeBlocks}`);
});

test('the command block wrapper actually scrolls instead of clipping or widening', () => {
  const css = readFileSync(path.join(siteRoot, 'assets', 'site.css'), 'utf8');
  const rule = css.match(/\.docs-command pre[^{}]*\{([^}]*)\}/);
  assert.ok(rule, 'site.css must keep a .docs-command pre rule');
  assert.match(rule[1], /overflow:\s*(auto|scroll|hidden)/, '.docs-command pre must set a non-visible overflow');
  assert.match(rule[1], /overflow:\s*auto/, '.docs-command pre must scroll horizontally rather than clip the command');
});
