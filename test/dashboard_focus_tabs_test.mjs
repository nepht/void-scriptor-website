import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('dashboard keeps overview compact and hides non-overview panels before JavaScript is ready', () => {
  const html = fs.readFileSync('dashboard.html', 'utf8');
  const css = fs.readFileSync('assets/site.css', 'utf8');

  assert.match(html, /<section class="dash-readiness" data-dashboard-panel="byte"/);
  assert.match(html, /<section class="dash-ops" data-dashboard-panel="byte"/);
  assert.match(html, /document\.body\.classList\.add\('dashboard-ready'\)/);
  assert.match(html, /var visible=showCenter&&cardView===view/);
  assert.match(css, /\.page-dashboard:not\(\.dashboard-ready\) \[data-dashboard-panel\]:not\(\[data-dashboard-panel=overview\]\)/);
  assert.match(css, /\.page-dashboard:not\(\.dashboard-ready\) \[data-dashboard-card-view\]:not\(\[data-dashboard-card-view=overview\]\)/);
});
