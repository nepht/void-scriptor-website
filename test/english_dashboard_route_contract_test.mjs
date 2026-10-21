import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('English homepage dashboard action targets the localized route', () => {
  const html = fs.readFileSync('en/index.html', 'utf8');
  assert.match(html, /href="\/en\/dashboard"/);
});

test('worker keeps the English dashboard alias inside the gated dashboard family', () => {
  const worker = fs.readFileSync('_worker.js', 'utf8');
  assert.match(worker, /const enDashboard = url\.pathname === '\/en\/dashboard'/);
  assert.match(worker, /\/en\/dashboard\.html/);
  assert.match(worker, /\/en\/dashboard\//);
});
