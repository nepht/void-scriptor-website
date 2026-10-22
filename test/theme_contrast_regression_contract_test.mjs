// Contract: dark-theme surfaces that ship a light background (carousel art
// stage, quiz waitlist card) must also pin the ink of every control inside
// them. Audit found inherited light-theme ink tokens leaking into these
// light-surfaced islands while the page ran in dark mode, producing
// contrast ratios as low as 1.17:1.
//
// Two regressions are locked here:
//   1. Dark-mode home carousel controls (.caro-arrow / .caro-index /
//      .caro-toggle) get dark ink because the carousel stage is pale in
//      both themes.
//   2. quiz.html QOWNER waitlist card declares its own dark-surface tokens
//      for h2 / labels / small print instead of inheriting page ink.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SITE_CSS = readFileSync(join(ROOT, 'assets', 'site.css'), 'utf8');
const QUIZ = readFileSync(join(ROOT, 'quiz.html'), 'utf8');
const EN_QUIZ = readFileSync(join(ROOT, 'en', 'quiz.html'), 'utf8');

test('dark-mode home carousel controls declare dark ink on the pale stage', () => {
  // .caro-arrow ink must resolve from the dark-ink token, not --cloud/--ice.
  assert.match(
    SITE_CSS,
    /\.page-home \.caro-arrow\{[^}]*color:var\(--caro-ink\)/,
    'site.css must pin .page-home .caro-arrow to var(--caro-ink)',
  );
  assert.match(
    SITE_CSS,
    /\.page-home \.carousel \.caro-nav \.caro-index\{[^}]*color:var\(--caro-ink-muted\)/,
    'site.css must pin .page-home .carousel .caro-nav .caro-index to var(--caro-ink-muted)',
  );
  assert.match(
    SITE_CSS,
    /\.page-home \.caro-nav \.caro-toggle\{[^}]*color:var\(--caro-ink-muted\)/,
    'site.css must pin .page-home .caro-nav .caro-toggle to var(--caro-ink-muted)',
  );
  assert.match(
    SITE_CSS,
    /--caro-ink:\s*#0b1b2b/,
    'site.css must define --caro-ink as the light-surface dark ink',
  );
  assert.match(
    SITE_CSS,
    /--caro-ink-muted:\s*#41556b/,
    'site.css must define --caro-ink-muted with >= 4.5:1 on the pale stage',
  );
});

test('quiz waitlist card pins theme-scoped ink tokens', () => {
  for (const [label, html] of [['quiz.html', QUIZ], ['en/quiz.html', EN_QUIZ]]) {
    assert.match(
      html,
      /\.qowner-waitlist h2\{[^}]*color:var\(--wl-h2,#f3ecff\)/,
      `${label}: .qowner-waitlist h2 must declare a light ink for the dark card`,
    );
    assert.match(
      html,
      /\.qowner-waitlist label\{[^}]*color:var\(--wl-label,#c9bfe6\)/,
      `${label}: .qowner-waitlist label must declare an accessible ink`,
    );
    assert.match(
      html,
      /\.qowner-waitlist small\{[^}]*color:var\(--wl-small,#b2a7cd\)/,
      `${label}: .qowner-waitlist small must declare an accessible ink`,
    );
  }
});