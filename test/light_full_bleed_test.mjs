import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../assets/site.css', import.meta.url), 'utf8');
const pages = ['../index.html', '../en/index.html'].map((path) => ({
  path,
  source: readFileSync(new URL(path, import.meta.url), 'utf8'),
}));
const quizPages = ['../quiz.html', '../en/quiz.html'].map((path) => ({
  path,
  source: readFileSync(new URL(path, import.meta.url), 'utf8'),
}));

test('both homepage locales render the three bright full-bleed product artworks', () => {
  for (const { path, source } of pages) {
    for (const [product, artwork] of [
      ['studio', 'void-studio.v2'],
      ['qowner', 'qowner-quiz.v2'],
      ['byte', 'byte-assistant.v2'],
    ]) {
      assert.match(
        source,
        new RegExp(`data-product="${product}"[\\s\\S]*?<figure class="caro-art"[\\s\\S]*?${artwork}`),
        `${path} must render the ${product} full-bleed artwork`,
      );
    }
    assert.match(source, /<meta name="theme-color" content="#f2f6fb">/);
  }
});

test('the final homepage stage uses light surfaces and dark readable copy', () => {
  assert.match(css, /\/\* Light cinematic production stage \*\//);
  assert.match(css, /\.page-home \.carousel \.caro-viewport\{[^}]*background:#f2f6fb/);
  assert.match(css, /\.page-home \.carousel \.caro-copy h2\{[^}]*color:#071423/);
  assert.match(css, /\.page-home \.carousel \.caro-slide\[data-product="studio"\]\{[^}]*--stage-accent:#315f9b/);
  assert.match(css, /\.page-home \.carousel \.caro-slide\[data-product="qowner"\]\{[^}]*--stage-accent:#805a1e/);
  assert.match(css, /\.page-home \.carousel \.caro-slide\[data-product="byte"\]\{[^}]*--stage-accent:#116b66/);
  assert.match(css, /\.page-home \.carousel \.caro-art img\{[^}]*brightness\(1\.12\)/);
});

test('QOWNER full-bleed opening and browser chrome use the light treatment in both locales', () => {
  assert.match(css, /\.page-quiz \.hero\{[^}]*background:#fffaf0/);
  assert.match(css, /\.page-quiz \.hero::before\{[^}]*brightness\(1\.18\)/);
  for (const { path, source } of quizPages) {
    assert.match(source, /<meta name="theme-color" content="#fffaf0">/, `${path} theme color must match the light QOWNER opening`);
  }
});
