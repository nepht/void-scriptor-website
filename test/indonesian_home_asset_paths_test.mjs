import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const home = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('Indonesian homepage keeps public assets rooted at the site origin', () => {
  const relativeAssetRefs = home.match(
    /(?:src|href|srcset)=["'](?:assets\/|favicon\.ico|site\.webmanifest)/g,
  ) || [];

  assert.deepEqual(relativeAssetRefs, []);
  assert.match(home, /href="\/site\.webmanifest"/);
  assert.match(home, /src="\/assets\/void_scriptor_emblem\.webp"/);
  assert.match(home, /src="\/assets\/byte_assistant\.webp"/);
});
