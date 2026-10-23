import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const css = fs.readFileSync('assets/site.css', 'utf8');
const pages = ['index.html', 'en/index.html'];

test('dark homepage brand hero has an isolated responsive art layer', () => {
  assert.match(css, /body\.theme-dark\.page-home \.brand-hero\{[^}]*position:relative;[^}]*overflow:hidden;[^}]*isolation:isolate/s,
    'dark brand hero must contain artwork instead of allowing intrinsic image height');
  assert.match(css, /body\.theme-dark\.page-home \.brand-hero-art\{[^}]*position:absolute;[^}]*inset:0/,
    'dark brand artwork must be an absolute background layer');
  assert.match(css, /body\.theme-dark\.page-home \.brand-hero-art img\{[^}]*width:100%;height:100%;object-fit:cover/,
    'dark brand artwork must fill the constrained hero');
  assert.match(css, /body\.theme-dark\.page-home \.brand-hero-inner\{[^}]*position:relative;[^}]*z-index:1/,
    'dark brand copy must remain above artwork');
});

test('dark homepage mobile geometry is explicit and preserves reduced motion', () => {
  assert.match(css, /@media\(max-width:760px\)[\s\S]*?body\.theme-dark\.page-home \.brand-hero\{[^}]*padding:/s,
    'dark brand hero needs a mobile geometry rule');
  assert.match(css, /@media\(max-width:760px\)[\s\S]*?body\.theme-dark\.page-home \.brand-hero-title\{[^}]*font-size:clamp\(/,
    'dark brand title needs fluid mobile sizing');
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/,
    'site must retain the reduced-motion contract');
});

test('both homepage locales keep the constrained dark hero contract', () => {
  for (const page of pages) {
    const source = fs.readFileSync(page, 'utf8');
    assert.match(source, /class="brand-hero"/, `${page}: brand hero is missing`);
    assert.match(source, /class="brand-hero-title"/, `${page}: hero title is missing`);
    assert.match(source, /class="brand-hero-actions"/, `${page}: hero CTA group is missing`);
  }
});
