import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

// Search engines truncate meta descriptions beyond ~160 characters, cutting off
// the call to action. Every public page must keep its static description within
// that budget. /quiz historically shipped 175 characters.

const PAGES = [
  'index.html',
  'en/index.html',
  'about.html',
  'changelog.html',
  'contact.html',
  'docs/getting-started.html',
  'privacy.html',
  'quiz.html',
  'report-bug.html',
  'status.html',
  'terms.html',
];

function metaDescription(html) {
  const m = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i);
  return m && m[1];
}

for (const page of PAGES) {
  test(`${page} meta description stays within the 160-character search snippet budget`, () => {
    const html = fs.readFileSync(page, 'utf8');
    const description = metaDescription(html);

    assert.ok(description, `${page} is missing a meta description`);
    assert.ok(
      description.length <= 160,
      `${page} meta description is ${description.length} characters (limit 160): ${description}`,
    );
  });
}
