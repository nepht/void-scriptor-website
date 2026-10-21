import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const pages = [
  ['byte.html', 'en/byte.html'],
  ['qowner.html', 'en/qowner.html'],
  ['studio.html', 'en/studio.html'],
];

async function title(file) {
  const html = await readFile(new URL(file, root), 'utf8');
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  assert.ok(match, `${file} should contain a title`);
  return match[1].trim();
}

test('ID/EN product titles are distinct and retain product identity', async () => {
  for (const [idPage, enPage] of pages) {
    const [idTitle, enTitle] = await Promise.all([title(idPage), title(enPage)]);
    assert.notEqual(idTitle, enTitle, `${idPage} and ${enPage} must not duplicate title text`);
    assert.match(idTitle, /Void Scriptor|Byte Assistant|QOWNER Quiz Maker/i, `${idPage} title should identify its product`);
    assert.match(enTitle, /Void Scriptor|Byte Assistant|QOWNER Quiz Maker/i, `${enPage} title should identify its product`);
  }
});
