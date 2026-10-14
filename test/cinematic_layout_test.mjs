import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const css = fs.readFileSync('assets/site.css', 'utf8');
const homepage = fs.readFileSync('index.html', 'utf8');
const englishHomepage = fs.readFileSync('en/index.html', 'utf8');

test('homepage uses the cinematic full-bleed visual system on both language routes', () => {
  assert.match(css, /\.page-home \.hero\{[^}]*min-height:100dvh/);
  assert.match(css, /\.page-home \.hero \.scene\{[^}]*background-image:url\(['"]?\/assets\/slides\/void-studio(?:\.v\d+)?\.webp/);
  assert.match(css, /\.page-home \.hero \.scene\{[^}]*transform:translate3d\(0,var\(--vs-hero-shift,0px\),0\) scale\(1\.035\)/);
  assert.match(css, /\.page-home \.hero \.scene\{[^}]*animation:cinematicFullBleed 24s ease-in-out infinite alternate/);
  assert.match(css, /@keyframes cinematicFullBleed\{from\{scale:1\.035\}to\{scale:1\.08\}\}/);
  assert.match(css, /\.page-home \.hero-inner\{[^}]*align-items:flex-start/);
  assert.match(css, /\.page-home \.carousel\{[^}]*width:100%/);
  assert.match(css, /\.page-home \.caro-viewport\{[^}]*border-inline:0/);
  assert.match(css, /\.page-home \.caro-slide\{[^}]*min-height:clamp\(560px,68vw,100dvh\)/);
  assert.match(css, /\.page-home \.caro-art img\{[^}]*object-position:50% 50%/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);

  for (const [route, source] of [['id', homepage], ['en', englishHomepage]]) {
    assert.match(source, /site\.css\?v=cinematic-20261014/,
      `${route} homepage must load the current theme stylesheet revision`);
  }
});

test('QOWNER keeps a cinematic full-height hero without forcing the dashboard layout', () => {
  assert.match(css, /\.page-quiz \.hero\{[^}]*min-height:max\(620px,100dvh\)/);
  assert.match(css, /\.page-quiz \.hero\{[^}]*display:grid/);
  assert.match(css, /@media\(max-width:760px\)[\s\S]*?\.page-quiz\{[^}]*background-position:18% top/);
  assert.match(css, /\.page-dashboard main\.dash\{[^}]*max-width/);
});

test('closed Byte does not float over homepage content on narrow screens', () => {
  assert.match(css, /@media\(max-width:760px\)[\s\S]*?\.page-home \.byte-assistant\{[^}]*position:relative/);
  assert.match(css, /@media\(max-width:760px\)[\s\S]*?\.page-home \.byte-assistant\.is-open\{[^}]*width:min\(/);
});
