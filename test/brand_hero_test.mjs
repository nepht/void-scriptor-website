import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

// The homepage used to open straight into a product stage, so the first thing a
// visitor met was a single product rather than the universe it belongs to. The
// brand hero now opens <main> with the Void Scriptor wordmark, a tagline, two
// calls to action and four capability entries, and the product presentation
// switch follows underneath. These assertions lock that order, the artwork
// contract, and the honesty rules the copy has to keep.

const pages = [
  {
    path: 'index.html',
    eyebrow: 'CIPTA · MAIN · JELAJAH',
    cta: 'Mulai dalam 5 menit',
    tagline: 'Alat untuk menjaga struktur proyek kreatif tetap konsisten.',
  },
  {
    path: 'en/index.html',
    eyebrow: 'CREATE · PLAY · EXPLORE',
    cta: 'Start in 5 minutes',
    tagline: 'A tool for keeping creative project structure consistent.',
  },
];

const heroMarkup = (source) => {
  const start = source.indexOf('<section class="brand-hero"');
  assert.ok(start > -1, 'brand hero section is missing');
  const end = source.indexOf('</section>', start);
  assert.ok(end > start, 'brand hero section is not closed');
  return source.slice(start, end);
};

test('the homepage opens with a brand hero before the product presentation', () => {
  for (const { path, eyebrow, cta, tagline } of pages) {
    const source = fs.readFileSync(path, 'utf8');
    const main = source.indexOf('<main id="main-content">');
    const hero = source.indexOf('<section class="brand-hero"');
    const switcher = source.indexOf('class="presentation-switch');

    assert.ok(main > -1, `${path}: <main> is missing`);
    assert.ok(hero > main, `${path}: the brand hero must be inside <main>`);
    assert.ok(hero < switcher, `${path}: the brand hero must come before the product switch`);

    assert.equal(
      (source.match(/<h1\b/g) ?? []).length,
      1,
      `${path}: the page must expose exactly one h1`,
    );
    assert.match(source, new RegExp(`data-i18n="hero-eyebrow">${eyebrow}<`), `${path}: eyebrow copy`);
    assert.match(source, new RegExp(`data-i18n="hero-tagline">${tagline}<`), `${path}: tagline copy`);
    assert.match(source, new RegExp(`data-i18n="hero-cta-enter">${cta}<`), `${path}: primary call to action`);

    // Four capability entries, each with an icon and a short description.
    assert.equal(
      (source.match(/class="brand-hero-caps"/g) ?? []).length,
      1,
      `${path}: one capability list`,
    );
    for (const key of ['hero-cap-1', 'hero-cap-2', 'hero-cap-3', 'hero-cap-4']) {
      assert.match(source, new RegExp(`data-i18n="${key}"`), `${path}: missing ${key}`);
      assert.match(source, new RegExp(`data-i18n="${key}d"`), `${path}: missing ${key}d`);
    }
    assert.equal(
      (source.match(/class="bh-ico"/g) ?? []).length,
      4,
      `${path}: every capability entry needs an icon`,
    );

    // The artwork is served from the site origin in two resolutions, under a
    // cache revision so a changed file is never shadowed by the edge cache.
    assert.match(
      source,
      /srcset="\/assets\/scenes\/hero-brand-1280\.webp\?v=[a-z0-9-]+ 1280w, \/assets\/scenes\/hero-brand\.webp\?v=[a-z0-9-]+ 1672w"/,
      `${path}: hero artwork must be root-absolute, responsive and cache-revisioned`,
    );

    // The product presentation the page already shipped must survive.
    assert.match(source, /class="carousel"/, `${path}: the product carousel must remain`);
    assert.equal(
      (source.match(/class="presentation-switch__tab"/g) ?? []).length,
      3,
      `${path}: the three-product switch must remain`,
    );
  }
});

test('the brand hero claims only what the products actually do', () => {
  const banned = [
    'komunitas',
    'Community',
    'komunitas global',
    'pengguna',
    'likes',
    'Trailer',
    'trailer',
    'kecerdasan buatan',
    'powered by AI',
  ];
  for (const { path } of pages) {
    const hero = heroMarkup(fs.readFileSync(path, 'utf8'));
    for (const term of banned) {
      assert.ok(!hero.includes(term), `${path}: the brand hero must not claim "${term}"`);
    }
  }
});

test('the brand hero artwork ships in both resolutions', () => {
  for (const file of ['assets/scenes/hero-brand.webp', 'assets/scenes/hero-brand-1280.webp']) {
    assert.ok(fs.existsSync(file), `missing ${file}`);
    assert.ok(fs.statSync(file).size > 10000, `${file} looks empty`);
  }
});

// The hero follows a supplied visual reference: a violet pill call to action
// with an arrow, an outlined second action with a play glyph, and a capability
// strip divided by hairlines instead of boxed cards. The label of every action
// stays inside its own i18n node so a language switch cannot drop the icon.
test('the brand hero keeps the reference composition for actions and capabilities', () => {
  for (const { path } of pages) {
    const source = fs.readFileSync(path, 'utf8');
    assert.match(
      source,
      /class="btn primary" href="(?:\/en)?\/docs\/getting-started"><span data-i18n="hero-cta-enter">/,
      `${path}: the primary call to action must keep its label beside an icon`,
    );
    assert.match(source, /class="bh-arrow"/, `${path}: the primary call to action needs an arrow`);
    assert.match(source, /class="bh-play"/, `${path}: the secondary call to action needs a play glyph`);
  }
  const css = fs.readFileSync('assets/light.css', 'utf8');
  assert.match(
    css,
    /body\.theme-light \.brand-hero-actions \.btn\.primary\{background:linear-gradient\(135deg,var\(--ls-violet\)/,
    'the primary call to action must be the violet pill',
  );
  assert.match(
    css,
    /body\.theme-light \.brand-hero-caps\{[^}]*border-top:1px solid var\(--ls-line\)/,
    'the capability strip must be separated from the copy by a hairline',
  );
  assert.match(
    css,
    /body\.theme-light \.brand-hero-caps li\{[^}]*border-left:1px solid var\(--ls-line\)/,
    'capability entries must be divided by a rule rather than boxed as cards',
  );
});
