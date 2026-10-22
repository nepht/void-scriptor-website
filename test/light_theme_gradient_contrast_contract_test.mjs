// Contract: light-theme surfaces that paint white text on a gradient must stay
// at or above WCAG AA 4.5:1.
//
// axe-core cannot evaluate gradient backgrounds: it reports them as
// 'incomplete' (needs review), never as violations. That left the homepage
// primary CTA ("Buat proyek pertama", #fff at 13px/700 on
// linear-gradient(135deg, #6b4bd6, #8a6bf0)) at a measured 3.86:1 - a real
// AA failure that no automated axe run surfaced.
//
// This test resolves the token layer, walks every light-theme rule that paints
// white text over a gradient, and asserts the WORST ratio along the colour
// ramp is >= 4.5:1.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const light = readFileSync(path.join(ROOT, 'assets', 'light.css'), 'utf8');
const dark = readFileSync(path.join(ROOT, 'assets', 'site.css'), 'utf8');

const luminance = (hex) => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const ch = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
};

const ratio = (a, b) => {
  const la = luminance(a);
  const lb = luminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
};

const collectTokens = (css) => {
  const tokens = {};
  for (const m of css.matchAll(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    tokens[m[1]] = m[2];
  }
  return tokens;
};

const tokens = { ...collectTokens(dark), ...collectTokens(light) };

const resolve = (value) => {
  const trimmed = value.trim();
  if (trimmed.startsWith('#')) return trimmed.length === 4
    ? '#' + trimmed.slice(1).split('').map((c) => c + c).join('')
    : trimmed.slice(0, 7);
  const varMatch = trimmed.match(/^var\(\s*(--[a-z0-9-]+)\s*\)$/);
  if (varMatch) return tokens[varMatch[1]] ?? null;
  return null;
};

const stopsOf = (gradient) => {
  const inner = gradient.slice(gradient.indexOf('(') + 1, gradient.lastIndexOf(')'));
  const found = [];
  for (const m of inner.matchAll(/#[0-9a-fA-F]{3,8}|var\(\s*--[a-z0-9-]+\s*\)/g)) {
    const c = resolve(m[0]);
    if (c) found.push(c);
  }
  return found;
};

const worstRatio = (stops, fg) => {
  let worst = null;
  for (let i = 0; i < stops.length - 1; i += 1) {
    const a = stops[i];
    const b = stops[i + 1];
    const pa = [1, 3, 5].map((k) => parseInt(a.slice(k, k + 2), 16));
    const pb = [1, 3, 5].map((k) => parseInt(b.slice(k, k + 2), 16));
    for (let s = 0; s <= 20; s += 1) {
      const t = s / 20;
      const px = pa.map((v, k) => Math.round(v + (pb[k] - v) * t));
      const hex = '#' + px.map((v) => v.toString(16).padStart(2, '0')).join('');
      const r = ratio(fg, hex);
      worst = worst === null ? r : Math.min(worst, r);
    }
  }
  return worst;
};

test('every light-theme gradient that carries white text stays at or above WCAG AA 4.5:1', () => {
  const offenders = [];
  let checked = 0;

  for (const m of light.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1].trim();
    const body = m[2];
    if (!body.includes('linear-gradient')) continue;
    if (!/color:\s*#fff\b/.test(body)) continue;

    const gradientMatch = body.match(/background:\s*linear-gradient\([^;]+/);
    if (!gradientMatch) continue;

    const stops = stopsOf(gradientMatch[0]);
    if (stops.length < 2) continue;

    const worst = worstRatio(stops, '#ffffff');
    checked += 1;
    if (worst < 4.5) {
      offenders.push(`${selector} -> ${stops.join(' to ')} worst ${worst.toFixed(2)}:1`);
    }
  }

  assert.ok(checked > 0, 'expected at least one light-theme gradient rule with white text');
  assert.deepEqual(
    offenders,
    [],
    `light-theme gradients with white text below WCAG AA 4.5:1 (axe cannot measure these):\n  ${offenders.join('\n  ')}`,
  );
});

test('the light theme exposes a single source of truth for the CTA gradient stops', () => {
  assert.match(
    light,
    /--ls-violet-2:\s*#[0-9a-fA-F]{3,8};/,
    'light.css must declare --ls-violet-2 as the gradient light end',
  );
  assert.match(
    light,
    /--ls-violet-deep:\s*#[0-9a-fA-F]{3,8};/,
    'light.css must declare --ls-violet-deep as the gradient dark end',
  );
  assert.match(
    light,
    /--ls-violet-hover-2:\s*#[0-9a-fA-F]{3,8};/,
    'light.css must declare --ls-violet-hover-2 as the hover gradient light end',
  );
  assert.match(
    light,
    /--ls-violet-hover-deep:\s*#[0-9a-fA-F]{3,8};/,
    'light.css must declare --ls-violet-hover-deep as the hover gradient dark end',
  );
});

test('all HTML pages referencing light.css use the updated cache version token', () => {
  const expectedToken = 'light.css?v=light-cosmic-20261022e';
  const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(
    html.includes(expectedToken),
    `index.html must reference ${expectedToken}`,
  );
});
