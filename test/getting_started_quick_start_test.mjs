import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const pages = [
  ['docs/getting-started.html', ['1 menit', '1 menit', '2 menit', '1 menit']],
  ['en/docs/getting-started.html', ['1 minute', '1 minute', '2 minutes', '1 minute']],
];

test('getting-started guides provide a timeboxed five-minute first project', () => {
  for (const [file, budgets] of pages) {
    const html = fs.readFileSync(file, 'utf8');
    assert.match(html, /5 MENIT|5 MINUTES|five minutes/i, file);
    for (const budget of budgets) assert.match(html, new RegExp(`\(${budget}\)`), `${file}: ${budget}`);
    assert.match(html, /satu proyek|one project/i, file);
    assert.match(html, /satu dunia|one world/i, file);
    assert.match(html, /satu karakter|one character/i, file);
    assert.match(html, /satu adegan|one scene/i, file);
  }
});
