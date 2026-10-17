import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const social = {
  instagram: 'https://www.instagram.com/voidscriptor/',
  threads: 'https://www.threads.com/@voidscriptor',
};

for (const page of ['index.html', 'en/index.html']) {
  test(`${page} exposes official social links in the footer and Organization schema`, () => {
    const html = readFileSync(join(root, page), 'utf8');
    for (const url of Object.values(social)) {
      assert.ok(html.includes(url), `${page} is missing ${url}`);
    }
    assert.match(html, /<footer[\s\S]*Instagram[\s\S]*Threads[\s\S]*<\/footer>/);
    assert.match(html, /"sameAs":\["https:\/\/www\.instagram\.com\/voidscriptor\/","https:\/\/www\.threads\.com\/@voidscriptor"\]/);
  });
}

for (const page of ['contact.html', 'en/contact.html']) {
  test(`${page} lists official social accounts in the contact content`, () => {
    const html = readFileSync(join(root, page), 'utf8');
    for (const url of Object.values(social)) {
      assert.ok(html.includes(url), `${page} is missing ${url}`);
    }
    assert.match(html, /Social media|Media sosial/);
  });
}
