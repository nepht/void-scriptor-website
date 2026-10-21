import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('English technical page uses status wording in its production caveat', () => {
  const source = fs.readFileSync('en/technical.html', 'utf8');
  assert.match(source, /Production status does not change just because a local file was fixed\./);
  assert.doesNotMatch(source, /Production technical does not change/);
});
