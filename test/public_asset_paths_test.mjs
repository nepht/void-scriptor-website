import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const englishHome = await readFile(new URL('../en/index.html', import.meta.url), 'utf8');

test('English homepage keeps public assets rooted at the site origin', () => {
  const relativeAssetRefs = englishHome.match(
    /(?:src|href|srcset)=["'](?:assets\/|favicon\.ico|site\.webmanifest)/g,
  ) || [];

  assert.deepEqual(relativeAssetRefs, []);
  assert.match(englishHome, /href="\/site\.webmanifest"/);
  assert.match(englishHome, /src="\/assets\/void_scriptor_emblem\.webp"/);
  assert.match(englishHome, /src="\/assets\/byte_assistant\.webp"/);
});
