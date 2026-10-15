import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const css = fs.readFileSync('assets/site.css', 'utf8');
const homepage = fs.readFileSync('index.html', 'utf8');
const englishHomepage = fs.readFileSync('en/index.html', 'utf8');
const quizPage = fs.readFileSync('quiz.html', 'utf8');
const englishQuizPage = fs.readFileSync('en/quiz.html', 'utf8');

test('homepage uses the cinematic full-bleed visual system on both language routes', () => {
  assert.match(css, /\.page-home \.hero\{[^}]*min-height:100dvh/);
  assert.match(css, /\.page-home \.hero \.scene\{[^}]*background-image:url\(['"]?\/assets\/slides\/void-studio(?:\.v\d+)?\.webp/);
  assert.match(css, /\.page-home \.hero \.scene\{[^}]*transform:translate3d\(0,var\(--vs-hero-shift,0px\),0\) scale\(1\.035\)/);
  assert.match(css, /\.page-home \.hero \.scene\{[^}]*animation:cinematicFullBleed 24s ease-in-out infinite alternate/);
  assert.match(css, /@keyframes cinematicFullBleed\{from\{scale:1;translate:0 0\}to\{scale:1\.08;translate:-1% 0\}\}/);
  assert.match(css, /\.page-home \.hero-inner\{[^}]*align-items:flex-start/);
  assert.match(css, /\.page-home \.carousel\{[^}]*width:100%/);
  assert.match(css, /\.page-home \.caro-viewport\{[^}]*border-inline:0/);
  assert.match(css, /\.page-home \.caro-slide\{[^}]*min-height:clamp\(560px,68vw,100dvh\)/);
  assert.match(css, /\.page-home \.caro-art img\{[^}]*object-position:50% 50%/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /animation-play-state:var\(--vs-hero-play,running\)/);
  assert.match(homepage, /IntersectionObserver/);
  assert.match(englishHomepage, /IntersectionObserver/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);

  const cssRevision = homepage.match(/site\.css\?v=([\w.-]+)/)?.[1];
  assert.ok(cssRevision, 'homepage must declare a theme stylesheet revision');
  assert.equal(englishHomepage.match(/site\.css\?v=([\w.-]+)/)?.[1], cssRevision,
    'ID and EN homepages must load the same theme stylesheet revision');
});

test('QOWNER hero applies a cinematic full-bleed art layer with reduced-motion fallback', () => {
  assert.match(css, /\.page-quiz \.hero\{[^}]*overflow:hidden/);
  assert.match(css, /\.page-quiz \.hero::before\{[^}]*url\(['"]?\/assets\/slides\/qowner-quiz\.v2\.webp/);
  assert.match(css, /\.page-quiz \.hero::before\{[^}]*animation:quizCinematicBleed 26s ease-in-out infinite alternate/);
  assert.match(css, /@keyframes quizCinematicBleed\{from\{scale:1;translate:0 0\}to\{scale:1\.08;translate:-1% 0\}\}/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{\.page-quiz \.hero::before\{animation:none;scale:1;translate:0 0\}\}/);
  assert.match(css, /animation-play-state:var\(--vs-quiz-play,running\)/);
  assert.match(quizPage, /--vs-quiz-play/);
  assert.match(englishQuizPage, /--vs-quiz-play/);
});

test('QOWNER keeps a cinematic full-height hero without forcing the dashboard layout', () => {
  assert.match(css, /\.page-quiz \.hero\{[^}]*min-height:max\(620px,100dvh\)/);
  assert.match(css, /\.page-quiz \.hero\{[^}]*display:grid/);
  assert.match(css, /@media\(max-width:760px\)[\s\S]*?\.page-quiz\{[^}]*background-position:18% top/);
  assert.match(css, /\.page-dashboard main\.dash\{[^}]*max-width/);
});

test('long status and documentation values wrap on narrow screens', () => {
  assert.match(css, /\.page-status code,\.page-docs code\{overflow-wrap:anywhere;word-break:break-word\}/);
  assert.match(css, /\.page-docs \.docs-command pre,\.page-docs \.docs-note pre\{max-width:100%;box-sizing:border-box;overflow-x:auto\}/);
  assert.match(css, /\.page-docs \.docs-command pre code\{white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word\}/);
});

test('hero artwork serves a size-appropriate variant on small screens', () => {
  const slideCandidates = (name) => `srcset="/assets/slides/${name}-1280.webp 1280w, /assets/slides/${name}-1920.webp 1920w, /assets/slides/${name}.webp 2560w" sizes="100vw"`;
  for (const [route, source] of [['id', homepage], ['en', englishHomepage]]) {
    for (const name of ['void-studio.v2', 'qowner-quiz.v2', 'byte-assistant.v2']) {
      assert.ok(source.includes(slideCandidates(name)),
        `${route} homepage must offer the 1280/1920/2560 candidates for ${name}`);
    }
    assert.doesNotMatch(source, /sizes="\(max-width: 720px\) 100vw, 58vw"/,
      `${route} homepage must drop the sizes hint that never matched the rendered width`);
  }
  assert.match(css, /@media\(max-width:900px\)\{\s*\.page-home \.hero \.scene\{background-image:url\('\/assets\/slides\/void-studio\.v2-1280\.webp'\)\}/);
  assert.match(css, /@media\(max-width:900px\)\{[\s\S]*?\.page-quiz \.hero::before\{background-image:[^}]*qowner-quiz\.v2-1280\.webp/);
});

test('closed Byte does not float over homepage content on narrow screens', () => {
  assert.match(css, /@media\(max-width:760px\)[\s\S]*?\.page-home \.byte-assistant\{[^}]*position:relative/);
  assert.match(css, /@media\(max-width:760px\)[\s\S]*?\.page-home \.byte-assistant\.is-open\{[^}]*width:min\(/);
});
