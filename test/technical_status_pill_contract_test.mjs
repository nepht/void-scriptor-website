import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const cases = [
  {
    page: 'technical.html',
    state: 'TERCATAT · BELUM DIVERIFIKASI',
    pill: 'BELUM DIVERIFIKASI',
  },
  {
    page: 'en/technical.html',
    state: 'RECORDED · NOT VERIFIED',
    pill: 'NOT VERIFIED',
  },
];

test('technical status pills do not overstate unverified availability', () => {
  for (const { page, state, pill } of cases) {
    const source = fs.readFileSync(page, 'utf8');
    const rows = [...source.matchAll(/<article class="technical-row technical-row--partial">[\s\S]*?<\/article>/g)]
      .map(([row]) => row);
    assert.ok(rows.length >= 2, `${page} should have website and Studio partial rows`);
    for (const row of rows.slice(0, 2)) {
      assert.match(row, new RegExp(state.replace(/[·]/g, '·')));
      assert.match(row, new RegExp(`<span class="technical-pill">${pill}</span>`));
      assert.doesNotMatch(row, /<span class="technical-pill">(?:TERSEDIA|AVAILABLE)<\/span>/);
    }
  }
});
