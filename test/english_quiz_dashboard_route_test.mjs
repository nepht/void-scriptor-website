import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const chip = (route) => `<a class="btn-out" href="${route}"`;

test('English QOWNER archive dashboard chip targets the English route', () => {
  const html = fs.readFileSync('en/quiz.html', 'utf8');
  assert.ok(html.includes(chip('/en/dashboard')), 'en/quiz.html must link the dashboard chip to /en/dashboard');
  assert.ok(!html.includes(chip('/dashboard')), 'en/quiz.html must not link the dashboard chip to the Indonesian /dashboard');
});

test('Indonesian QOWNER archive keeps the Indonesian dashboard route', () => {
  const html = fs.readFileSync('quiz.html', 'utf8');
  assert.ok(html.includes(chip('/dashboard')), 'quiz.html must keep the dashboard chip on /dashboard');
  assert.ok(!html.includes(chip('/en/dashboard')), 'quiz.html must not link the dashboard chip to /en/dashboard');
});
