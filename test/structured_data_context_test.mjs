import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

// Every page that emits JSON-LD must publish a block whose top-level @context
// points at schema.org. A single corrupted context (an obfuscated "https://***"
// placeholder, for example) makes the entire block unparseable, so search
// engines and rich-result parsers silently drop that page's structured data.
// The English changelog shipped exactly that corruption on its WebPage schema
// while its Indonesian twin was fine, and no test parsed the blocks.
//
// This walks the publish tree (so nested pages are covered) and JSON.parse()s
// every block, so an invalid context fails loudly instead of passing a
// substring check.

const SKIP_DIRS = new Set(['node_modules', '.git', '.wrangler', 'app', 'tools', 'test', 'migrations']);

function walkHtml(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walkHtml(dir === '.' ? entry.name : `${dir}/${entry.name}`, out);
    } else if (entry.name.endsWith('.html')) {
      out.push(dir === '.' ? entry.name : `${dir}/${entry.name}`);
    }
  }
  return out;
}

function jsonLdBlocks(html) {
  return [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map((m) => m[1].trim());
}

const pages = walkHtml('.', []).sort();

test('every JSON-LD block on every public page is valid JSON', () => {
  for (const page of pages) {
    const html = fs.readFileSync(page, 'utf8');
    for (const raw of jsonLdBlocks(html)) {
      assert.doesNotThrow(
        () => JSON.parse(raw),
        `${page} ships an invalid JSON-LD block: ${raw.slice(0, 100)}`,
      );
    }
  }
});

test('every JSON-LD block declares the schema.org context', () => {
  for (const page of pages) {
    const html = fs.readFileSync(page, 'utf8');
    for (const raw of jsonLdBlocks(html)) {
      const block = JSON.parse(raw);
      assert.equal(
        block['@context'],
        'https://schema.org',
        `${page} JSON-LD @context must be https://schema.org, got ${JSON.stringify(block['@context'])}`,
      );
    }
  }
});

test('no public page ships the obfuscated https://*** context placeholder', () => {
  for (const page of pages) {
    const html = fs.readFileSync(page, 'utf8');
    assert.ok(
      !html.includes('https://***'),
      `${page} still contains the obfuscated "https://***" placeholder`,
    );
  }
});

test('the English changelog schema parses as a valid WebPage (regression)', () => {
  const blocks = jsonLdBlocks(fs.readFileSync('en/changelog.html', 'utf8')).map((raw) => JSON.parse(raw));
  const page = blocks.find((b) => b['@type'] === 'WebPage');
  assert.ok(page, 'en/changelog.html must expose a WebPage block');
  assert.equal(page['@context'], 'https://schema.org');
  assert.equal(page.name, 'Void Scriptor release notes');
});
