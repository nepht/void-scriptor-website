import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

for (const file of ['quiz.html', 'en/quiz.html']) {
  test(`${file} keeps exactly one main landmark`, () => {
    const html = read(file);
    const mains = html.match(/<main\b/g) ?? [];
    assert.equal(mains.length, 1, `${file} must expose exactly one <main> landmark`);
  });

  test(`${file} keeps the visible preview inside the main landmark`, () => {
    const html = read(file);
    const mainStart = html.indexOf('<main');
    const mainEnd = html.indexOf('</main>');
    const preview = html.indexOf('id="preview"');
    const hero = html.indexOf('class="hero"');
    assert.ok(mainStart > -1 && mainEnd > mainStart, `${file} needs a closed <main> region`);
    assert.ok(preview > mainStart && preview < mainEnd, `${file} preview must live inside <main>`);
    assert.ok(hero > -1 && hero < mainEnd, `${file} hero must live inside <main>`);
  });

  test(`${file} keeps the gated archive landmark-free of nested main`, () => {
    const html = read(file);
    const gate = html.indexOf('id="gateContent"');
    const mainStart = html.indexOf('<main');
    const mainEnd = html.indexOf('</main>');
    assert.ok(gate > mainStart && gate < mainEnd, `${file} gate content must live inside <main>`);
    assert.doesNotMatch(
      html,
      /<main[^>]*id="gateContent"/,
      `${file} gate content container must not be a redundant <main>`,
    );
  });
}

for (const file of ['index.html', 'en/index.html']) {
  test(`${file} keeps the carousel slide role valid for its element`, () => {
    const html = read(file);
    const slide = html.match(/<div id="caro-slide-1"[^>]*>/)?.[0] ?? '';
    assert.ok(slide, `${file} must keep the first carousel slide as a div container`);
    assert.match(
      slide,
      /\brole="group"/,
      `${file} carousel slide container must expose role="group" on a generic element`,
    );
    assert.doesNotMatch(
      html,
      /<article[^>]*id="caro-slide/,
      `${file} carousel slides must not use <article> with role="group"`,
    );
  });
}
