import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

function localePair(htmlPath) {
  const source = fs.readFileSync(htmlPath, 'utf8');
  const primary = source.match(/<meta property="og:locale" content="([^"]+)">/);
  const alternate = source.match(/<meta property="og:locale:alternate" content="([^"]+)">/);
  return { primary: primary && primary[1], alternate: alternate && alternate[1] };
}

test('Open Graph locale declares the page locale and a distinct alternate locale', () => {
  const root = localePair('index.html');
  assert.equal(root.primary, 'id_ID');
  assert.equal(root.alternate, 'en_US');

  const english = localePair('en/index.html');
  assert.equal(english.primary, 'en_US');
  assert.equal(english.alternate, 'id_ID');
});
