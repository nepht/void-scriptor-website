import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflowPath = '.github/workflows/release-integrity.yml';
const assetsIgnorePath = '.assetsignore';

test('release integrity workflow runs on main release changes and manual dispatch', () => {
  const workflow = fs.readFileSync(workflowPath, 'utf8');

  assert.match(workflow, /name:\s*Release integrity/i);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /branches:\s*\[main\]/);
  assert.match(workflow, /release-manifests\//);
  assert.match(workflow, /tools\/verify-release\.ps1/);
  assert.match(workflow, /permissions:\s*\n\s+contents:\s+read/);
  assert.match(workflow, /npm ci --ignore-scripts/);
  assert.match(workflow, /node --test test\/\*\.mjs/);
});

test('release integrity workflow cannot publish or consume signing secrets', () => {
  const workflow = fs.readFileSync(workflowPath, 'utf8');

  assert.doesNotMatch(workflow, /secrets\./i);
  assert.doesNotMatch(workflow, /wrangler\s+pages\s+deploy/i);
  assert.doesNotMatch(workflow, /git\s+push/i);
});

test('internal GitHub workflow files stay out of the Pages asset bundle', () => {
  const assetsIgnore = fs.readFileSync(assetsIgnorePath, 'utf8');

  assert.match(assetsIgnore, /^\.github\/$/m);
});
