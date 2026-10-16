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
    eyebrow: 'CIPTA · MAIN · JELAJAH · BERSAMA',
    cta: 'Jelajahi Semesta',
    tagline: 'Semesta kreatif untuk pemimpi, pembangun, dan pikiran penasaran.',
  },
  {
    path: 'en/index.html',
    eyebrow: 'CREATE · PLAY · EXPLORE · TOGETHER',
    cta: 'Enter the Universe',
    tagline: 'A creative universe for dreamers, builders and curious minds.',
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

    // The artwork is served from the site origin in two resolutions.
    assert.match(
      source,
      /srcset="\/assets\/scenes\/hero-brand-1280\.webp 1280w, \/assets\/scenes\/hero-brand\.webp 1672w"/,
      `${path}: hero artwork must be root-absolute and responsive`,
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
