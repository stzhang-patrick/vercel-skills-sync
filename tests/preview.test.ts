import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripVTControlCharacters } from 'node:util';
import { renderPreview } from '../dist/preview.js';

test('renders aligned table, status labels, and totals with optional color', () => {
  const items = [{ action: 'Update', name: 'review' }, { action: 'Add', name: 'testing' }, { action: 'Remove', name: 'legacy' }, { action: 'Unchanged', name: 'deploy' }] as const;
  const plain = renderPreview('team/skills', true, [...items], false);
  const colored = renderPreview('team/skills', true, [...items], true);
  assert.equal(stripVTControlCharacters(colored), plain);
  assert.match(plain, /1 update · 1 addition · 1 removal · 1 unchanged/);
  const rows = plain.split('\n').filter((line) => /^[┌│├└]/.test(line));
  assert.equal(new Set(rows.map((line) => line.length)).size, 1);
  for (const code of ['33', '32', '31', '90']) assert.ok(colored.includes(`\u001b[${code}m`));
  assert.ok(!plain.includes('\u001b'));
});
