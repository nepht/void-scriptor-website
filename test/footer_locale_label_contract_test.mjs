import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function footerAnchors(file) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const footer = html.match(/<footer[\s\S]*?<\/footer>/i);
  assert.ok(footer, `${file} must have a footer`);
  return [...footer[0].matchAll(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map((m) => ({
    href: m[1],
    text: m[2].trim(),
  }));
}

// Canonical bilingual footer label pairs, anchored on the homepage footer
// (Get started / Service health) and the target pages' own titles.
const EN_CANONICAL = {
  '/en/docs/getting-started': 'Get started',
  '/en/status': 'Service health',
};
const ID_CANONICAL = {
  '/docs/getting-started': 'Mulai',
  '/status': 'Kesehatan layanan',
};

const PAIRS = [
  ['index.html', 'en/index.html'],
  ['about.html', 'en/about.html'],
  ['contact.html', 'en/contact.html'],
  ['changelog.html', 'en/changelog.html'],
  ['roadmap.html', 'en/roadmap.html'],
  ['status.html', 'en/status.html'],
  ['help.html', 'en/help.html'],
  ['downloads.html', 'en/downloads.html'],
  ['tutorials.html', 'en/tutorials.html'],
  ['technical.html', 'en/technical.html'],
  ['privacy.html', 'en/privacy.html'],
  ['terms.html', 'en/terms.html'],
  ['products.html', 'en/products.html'],
  ['qowner.html', 'en/qowner.html'],
  ['quiz.html', 'en/quiz.html'],
  ['report-bug.html', 'en/report-bug.html'],
  ['studio.html', 'en/studio.html'],
  ['byte.html', 'en/byte.html'],
];

test('footers use the canonical bilingual label pairs', () => {
  const problems = [];
  for (const [idFile, enFile] of PAIRS) {
    for (const [file, canonical] of [
      [idFile, ID_CANONICAL],
      [enFile, EN_CANONICAL],
    ]) {
      for (const { href, text } of footerAnchors(file)) {
        const target = canonical[href.replace(/\/$/, '')];
        if (target && text !== target) {
          problems.push(`${file}: href=${href} label=${JSON.stringify(text)} expected=${JSON.stringify(target)}`);
        }
      }
    }
  }
  assert.deepEqual(problems, []);
});

test('EN footer labels for a given target are identical across pages', () => {
  const byHref = new Map();
  for (const [, enFile] of PAIRS) {
    for (const { href, text } of footerAnchors(enFile)) {
      // The footer brand anchor (VOID SCRIPTOR) shares the home href with the
      // "Home" nav entry; it is brand identity, not a navigation label.
      if (text === 'VOID SCRIPTOR') continue;
      if (!byHref.has(href)) byHref.set(href, new Map());
      byHref.get(href).set(text, enFile);
    }
  }
  const conflicts = [];
  for (const [href, labels] of byHref) {
    if (labels.size > 1) {
      conflicts.push(`${href}: ${[...labels].map(([t, f]) => `${JSON.stringify(t)}@${f}`).join(', ')}`);
    }
  }
  assert.deepEqual(conflicts, []);
});
