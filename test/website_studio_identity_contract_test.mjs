import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

// Sprint #5: Void Scriptor is the website/platform; "Void Scriptor Studio" is
// only ever the desktop product (Windows), backed by repo evidence (the
// published Studio bundle + studio_status_copy tests). Every earlier copy that
// named Void Scriptor itself a "studio" conflated the platform with the
// product and is forbidden here. The operator voice ("a small independent
// studio" in contact/response-time copy) is allowed because it describes the
// team, not the platform.

const IDENTITY_PAGES = [
  'index.html', 'en/index.html',
  'about.html', 'en/about.html',
  'contact.html', 'en/contact.html',
  'privacy.html', 'en/privacy.html',
  'changelog.html', 'en/changelog.html',
  'studio.html', 'en/studio.html',
];

const FORBIDDEN = [
  'studio teknologi independen', 'Studio teknologi independen',
  'studio independen', 'Studio independen',
  'independent technology studio', 'Independent technology studio',
  'Tentang studio', 'About the studio',
  'TENTANG STUDIO', 'ABOUT THE STUDIO',
  'Void Scriptor adalah studio', 'Void Scriptor is an independent studio',
  'Void Scriptor, an independent studio', 'Void Scriptor, studio independen',
];

test('no page describes Void Scriptor itself as a studio', () => {
  const problems = [];
  for (const page of IDENTITY_PAGES) {
    const html = fs.readFileSync(page, 'utf8');
    for (const phrase of FORBIDDEN) {
      if (html.includes(phrase)) problems.push(`${page}: contains ${JSON.stringify(phrase)}`);
    }
    for (const m of html.matchAll(/independent studio/g)) {
      const ctx = html.slice(Math.max(0, m.index - 22), m.index + m[0].length + 10);
      if (!ctx.includes('small, independent studio') && !ctx.includes('small independent studio')) {
        problems.push(`${page}: unguarded "independent studio" in ${JSON.stringify(ctx)}`);
      }
    }
  }
  assert.deepEqual(problems, []);
});

test('Void Scriptor is presented as the website and platform in both languages', () => {
  const required = {
    'index.html': 'Website dan platform di balik Void Scriptor Studio',
    'en/index.html': 'website and platform behind Void Scriptor Studio',
    'about.html': 'website dan platform',
    'en/about.html': 'website and platform',
    'contact.html': 'website dan platform yang dikelola oleh Choirudin',
    'en/contact.html': 'website and platform operated by Choirudin',
    'privacy.html': 'website dan platform yang dikelola oleh Choirudin',
    'en/privacy.html': 'the website and platform managed by Choirudin',
    'changelog.html': 'Website dan platform',
    'en/changelog.html': 'Website and platform',
  };
  for (const [page, phrase] of Object.entries(required)) {
    assert.ok(fs.readFileSync(page, 'utf8').includes(phrase), `${page} must state ${JSON.stringify(phrase)}`);
  }
});

test('Organization schema describes the platform, not a studio', () => {
  const idSchema = fs.readFileSync('index.html', 'utf8').match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g).join('\n');
  assert.ok(idSchema.includes('"description":"Website dan platform yang berfokus'));
  assert.ok(!/studio teknologi independen/i.test(idSchema));
  const enSchema = fs.readFileSync('en/index.html', 'utf8').match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g).join('\n');
  assert.ok(enSchema.includes('"description":"A website and platform focused'));
  assert.ok(!/independent technology studio/i.test(enSchema));
});

test('Void Scriptor Studio remains the desktop product claim', () => {
  // Repo evidence: the published Studio bundle (studio_web_bundle_test) and
  // studio_status_copy_test pin the Windows/desktop product identity.
  const idStudio = fs.readFileSync('studio.html', 'utf8');
  const enStudio = fs.readFileSync('en/studio.html', 'utf8');
  assert.ok(idStudio.includes('Void Scriptor Studio'), 'ID Studio page names the product');
  assert.ok(enStudio.includes('Void Scriptor Studio'), 'EN Studio page names the product');
  assert.ok(/alat kreatif desktop/.test(idStudio), 'ID calls Studio a desktop creative tool');
  assert.ok(/desktop creative tool/.test(enStudio), 'EN calls Studio a desktop creative tool');

  const home = fs.readFileSync('index.html', 'utf8');
  const block = home.match(/"@type"\s*:\s*"SoftwareApplication"[\s\S]{0,400}/);
  assert.ok(block, 'homepage must keep the SoftwareApplication block');
  assert.ok(block[0].includes('"name":"Void Scriptor Studio"'));
  assert.ok(block[0].includes('"operatingSystem":"Windows"'));
});
