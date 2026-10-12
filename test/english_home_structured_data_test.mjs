import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

// The English homepage translates its visible copy and <meta> tags, but the
// JSON-LD structured data was left in Indonesian. Search engines and social
// crawlers read those `description` fields, so an English page advertising
// "Studio teknologi independen ..." in its Organization/SoftwareApplication
// schema is a real bilingual/SEO defect (verified live on /en/). The WebSite
// `inLanguage` array also listed "id" first on the English page.
//
// This test parses the emitted JSON-LD (not just a substring match) so the
// blocks must stay valid JSON, and it asserts the English page carries no
// Indonesian schema copy while the Indonesian page still does.

function jsonLdBlocks(htmlPath) {
  const source = fs.readFileSync(htmlPath, 'utf8');
  return [...source.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((m) => m[1].trim());
}

test('English homepage JSON-LD blocks are valid JSON', () => {
  const blocks = jsonLdBlocks('en/index.html');
  assert.ok(blocks.length >= 3, 'expected Organization, WebSite and SoftwareApplication blocks');
  for (const raw of blocks) {
    assert.doesNotThrow(() => JSON.parse(raw), `invalid JSON-LD block: ${raw.slice(0, 80)}`);
  }
});

test('English homepage structured data contains no Indonesian copy', () => {
  const schema = jsonLdBlocks('en/index.html').join('\n');
  const indonesian = [
    'Studio teknologi independen',
    'Studio kreatif untuk',
    'perangkat lunak kreatif',
    'basis data proyek',
    'yang berfokus',
  ];
  for (const phrase of indonesian) {
    assert.ok(!schema.includes(phrase), `English structured data still contains Indonesian: "${phrase}"`);
  }
});

test('English homepage WebSite schema declares English before Indonesian', () => {
  const blocks = jsonLdBlocks('en/index.html').map((raw) => JSON.parse(raw));
  const website = blocks.find((b) => b['@type'] === 'WebSite');
  assert.ok(website, 'WebSite block must exist');
  assert.deepEqual(website.inLanguage, ['en', 'id']);
});

test('Indonesian homepage keeps its Indonesian structured data (control)', () => {
  const schema = jsonLdBlocks('index.html').join('\n');
  assert.match(schema, /Studio teknologi independen/);
  const blocks = jsonLdBlocks('index.html').map((raw) => JSON.parse(raw));
  const website = blocks.find((b) => b['@type'] === 'WebSite');
  assert.ok(website, 'WebSite block must exist');
  assert.deepEqual(website.inLanguage, ['id', 'en']);
});
