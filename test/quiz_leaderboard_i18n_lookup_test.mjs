import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

// The QOWNER leaderboard block defines its own `function lang()` (returning the
// 'id'/'en' string) which shadows the page-level `var lang` string. A lookup
// written as `dict[lang]` therefore indexes the dictionary with a function
// object: it yields undefined, and the following ['leader-policy'] access
// throws "Cannot read properties of undefined". Because that throw happens
// inside setLang(), the remaining per-language renderers and the ID/EN button
// toggle never ran, and the panel stayed on "could not load" even though
// /api/qowner/leaderboard answered 200. Every lookup in this block must be
// keyed by the string, i.e. dict[lang()].

const START = '/* ---- Public QOWNER preview + leaderboard';
const END = 'window.__qownerLeaderboardRender=function(){render()};';

function leaderboardBlock() {
  const html = fs.readFileSync('quiz.html', 'utf8');
  const from = html.indexOf(START);
  const to = html.indexOf(END, from);
  assert.ok(from !== -1 && to > from, 'quiz.html must keep the leaderboard block markers');
  return html.slice(from, to);
}

test('the leaderboard block keys the i18n dictionary with a string, not the lang function', () => {
  const block = leaderboardBlock();
  const lookups = [...block.matchAll(/dict\[([^\]]+)\]/g)].map((match) => match[1].trim());
  assert.ok(lookups.length > 0, 'expected at least one dictionary lookup in the leaderboard block');
  for (const key of lookups) {
    assert.notEqual(key, 'lang', 'dict[lang] passes the lang function as the key; use dict[lang()]');
  }
});

test('the leaderboard policy line resolves the translated leader-policy string', () => {
  assert.match(leaderboardBlock(), /dict\[lang\(\)\]\['leader-policy'\]/);
});

test('the leaderboard block still declares both locale dictionaries it reads from', () => {
  const html = fs.readFileSync('quiz.html', 'utf8');
  assert.match(html, /dict\.id\['leader-policy'\]/);
  assert.match(html, /dict\.en\['leader-policy'\]/);
});
