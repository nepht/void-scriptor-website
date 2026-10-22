// Contract: Dark and Light theme toggle functionality across Void Scriptor Website.
// Validates:
// 1. All public pages with navigation header carry the accessible #btnTheme (.btn-theme) control.
// 2. Both theme icons (.icon-moon and .icon-sun) are embedded as responsive SVGs.
// 3. assets/site.css declares .btn-theme with WCAG 2.5.8 compliant touch targets (min >= 44x44px).
// 4. assets/light.css declares body.theme-light .btn-theme theme-adaptive overrides.
// 5. assets/theme.js implements theme detection, DOM class toggling, and localStorage persistence.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';

const ROOT = resolve(process.cwd());
const SITE_CSS_PATH = resolve(ROOT, 'assets/site.css');
const LIGHT_CSS_PATH = resolve(ROOT, 'assets/light.css');
const THEME_JS_PATH = resolve(ROOT, 'assets/theme.js');

function getPublicHtmlFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.wrangler' || entry === 'work' || entry === 'worktree') continue;
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...getPublicHtmlFiles(fullPath));
    } else if (entry.endsWith('.html') && entry !== '404.html' && !fullPath.includes('docs/index.html')) {
      files.push(fullPath);
    }
  }
  return files;
}

test('theme toggle contract: assets/theme.js exists and implements theme switching', () => {
  assert.ok(existsSync(THEME_JS_PATH), 'assets/theme.js must exist');
  const js = readFileSync(THEME_JS_PATH, 'utf8');
  assert.match(js, /localStorage\.getItem\(['"]vs_theme['"]\)/, 'must read vs_theme from localStorage');
  assert.match(js, /localStorage\.setItem\(['"]vs_theme['"]/, 'must write vs_theme to localStorage');
  assert.match(js, /classList\.(?:add|remove)\(['"]theme-light['"]\)/, 'must toggle theme-light class');
  assert.match(js, /prefers-color-scheme:\s*dark/, 'must support OS dark mode media query preference');
});

test('theme toggle contract: assets/site.css declares .btn-theme touch target >= 44x44px', () => {
  const css = readFileSync(SITE_CSS_PATH, 'utf8');
  assert.match(
    css,
    /\.btn-theme[^{]*\{[^}]*min-width:\s*(?:4[4-9]|[5-9]\d)px/,
    '.btn-theme must declare min-width: 44px (or greater)',
  );
  assert.match(
    css,
    /\.btn-theme[^{]*\{[^}]*min-height:\s*(?:4[4-9]|[5-9]\d)px/,
    '.btn-theme must declare min-height: 44px (or greater)',
  );
});

test('theme toggle contract: assets/light.css declares body.theme-light .btn-theme rule', () => {
  const css = readFileSync(LIGHT_CSS_PATH, 'utf8');
  assert.match(
    css,
    /body\.theme-light\s+\.btn-theme/,
    'assets/light.css must declare body.theme-light .btn-theme rule',
  );
});

test('theme toggle contract: public pages carry #btnTheme and theme assets', () => {
  const pages = getPublicHtmlFiles(ROOT);
  assert.ok(pages.length >= 35, `expected at least 35 public HTML pages, found ${pages.length}`);

  for (const pagePath of pages) {
    const rel = relative(ROOT, pagePath).replace(/\\/g, '/');
    const html = readFileSync(pagePath, 'utf8');

    // Skip pages without header navigation
    if (!html.includes('<header')) continue;

    assert.ok(
      html.includes('id="btnTheme"') || html.includes('class="btn-theme"'),
      `${rel} must include #btnTheme in navigation header`,
    );
    assert.ok(
      html.includes('icon-moon') && html.includes('icon-sun'),
      `${rel} must include both icon-moon and icon-sun SVGs`,
    );
    assert.ok(
      html.includes('assets/theme.js') || html.includes('vs_theme'),
      `${rel} must reference theme.js or include anti-FOUC theme loader`,
    );
  }
});

test('theme toggle contract: 404 error page carries #btnTheme and anti-FOUC loader', () => {
  const p404 = resolve(ROOT, '404.html');
  const html = readFileSync(p404, 'utf8');
  assert.ok(
    html.includes('id="btnTheme"') || html.includes('class="btn-theme"'),
    '404.html must include #btnTheme',
  );
  assert.ok(
    html.includes('icon-moon') && html.includes('icon-sun'),
    '404.html must include theme icons',
  );
  assert.ok(
    html.includes('assets/theme.js'),
    '404.html must reference assets/theme.js',
  );
  assert.ok(
    html.includes('vs_theme'),
    '404.html must include anti-FOUC theme loader',
  );
});
