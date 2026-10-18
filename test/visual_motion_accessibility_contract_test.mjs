import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

test('visual assets contract: all scene artworks are valid WebP with responsive pairs', () => {
  const scenesDir = 'assets/scenes';
  const files = readdirSync(scenesDir).filter(f => f.endsWith('.webp'));
  assert.ok(files.length >= 70, `expected at least 70 scene webp files, found ${files.length}`);

  const set = new Set(files);
  for (const f of files) {
    const fullPath = join(scenesDir, f);
    const buf = readFileSync(fullPath);
    // RIFF....WEBP check
    assert.equal(buf.subarray(0, 4).toString('ascii'), 'RIFF', `${f} must start with RIFF`);
    assert.equal(buf.subarray(8, 12).toString('ascii'), 'WEBP', `${f} must contain WEBP marker`);

    // responsive pair check
    if (f.endsWith('-1280.webp')) {
      const base = f.replace('-1280.webp', '.webp');
      assert.ok(set.has(base), `${f} missing desktop pair ${base}`);
    } else {
      const variant = f.replace('.webp', '-1280.webp');
      assert.ok(set.has(variant), `${f} missing 1280 variant ${variant}`);
    }
  }
});

test('motion accessibility contract: animations respect prefers-reduced-motion and pause controls', () => {
  const siteCss = readFileSync('assets/site.css', 'utf8');
  assert.match(siteCss, /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/, 'site.css must have prefers-reduced-motion block');
  assert.match(siteCss, /animation-duration\s*:\s*\.01ms\s*!important/, 'site.css must have universal reduced-motion zero-duration');

  // Hero animation controllable via CSS var play-state
  assert.match(siteCss, /--vs-hero-play/, 'site.css must wire hero animation to --vs-hero-play custom property');
  assert.match(siteCss, /--vs-quiz-play/, 'site.css must wire quiz animation to --vs-quiz-play custom property');

  // No obsolete marquee tag in html files
  const htmlFiles = readdirSync('.').filter(f => f.endsWith('.html'));
  for (const h of htmlFiles) {
    const content = readFileSync(h, 'utf8');
    assert.doesNotMatch(content, /<marquee/i, `${h} must not use obsolete marquee elements`);
  }
});
