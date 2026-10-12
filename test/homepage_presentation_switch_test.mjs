import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const pages = ['index.html', 'en/index.html'];

test('homepage product presentation has a keyboard-ready product switch', () => {
  for (const page of pages) {
    const source = fs.readFileSync(page, 'utf8');
    assert.match(source, /class="presentation-switch(?:\s|")/, `${page}: product switch is missing`);
    assert.match(source, /role="tablist"[^>]*aria-label="[^"]+"/, `${page}: product switch needs a labelled tablist`);
    assert.equal(
      (source.match(/class="presentation-switch__tab"/g) ?? []).length,
      3,
      `${page}: product switch must expose Studio, QOWNER, and Byte`,
    );
    assert.match(source, /data-slide="0"[^>]*aria-controls="caro-slide-1"/);
    assert.match(source, /data-slide="1"[^>]*aria-controls="caro-slide-2"/);
    assert.match(source, /data-slide="2"[^>]*aria-controls="caro-slide-3"/);
    assert.match(
      source,
      /body\.page-home:not\(\.carousel-ready\).*caro-slide:first-child/s,
      `${page}: Studio needs a no-JavaScript visual fallback`,
    );
    assert.match(
      source,
      /document\.body\.classList\.add\('carousel-ready'\)/,
      `${page}: carousel must mark itself ready before taking over the fallback`,
    );
    assert.match(
      source,
      /presentation-switch__tab.*addEventListener\('click'/s,
      `${page}: product switch needs click behavior`,
    );
    assert.match(
      source,
      /presentation-switch__tab.*keydown/s,
      `${page}: product switch needs keyboard behavior`,
    );
    assert.match(
      source,
      /scrollIntoView\(/,
      `${page}: selecting a product should keep its presentation in view`,
    );
  }
});
