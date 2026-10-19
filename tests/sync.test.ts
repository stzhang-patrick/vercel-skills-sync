import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sync, executePlan } from '../dist/sync.js';
import type { SyncOptions } from '../dist/sync.js';

const options: SyncOptions = { repository: 'team/skills', global: true, cwd: process.cwd(), agents: ['claude-code'], yes: false };
const record = { source: 'team/skills', sourceType: 'github' };
const plan = [{ action: 'Update', name: 'review' }, { action: 'Add', name: 'testing' }, { action: 'Remove', name: 'legacy', recordKey: 'legacy' }] as const;

test('failed installation never starts removal', async () => {
  const calls: string[] = [];
  await assert.rejects(executePlan([...plan], options, {
    client: { install: async () => { calls.push('install'); throw new Error('network'); }, remove: async () => { calls.push('remove'); } } as never,
    records: async () => ({}), output: () => {},
  }), /network/);
  assert.deepEqual(calls, ['install']);
});

test('installs before removal and rechecks ownership', async () => {
  const calls: string[] = [];
  const client = { install: async (_repo: string, names: string[]) => { calls.push('install:'+names.join(',')); }, remove: async (name: string) => { calls.push('remove:'+name); } } as never;
  await executePlan([...plan], options, { client, records: async () => ({ review: record, testing: record, legacy: record }), output: () => {} });
  assert.deepEqual(calls, ['install:review,testing','remove:legacy']);
  await assert.rejects(executePlan([{ action: 'Remove', name: 'legacy' }], options, { client, records: async () => ({ legacy: { source: 'other/repo', sourceType: 'github' } }), output: () => {} }), /ownership changed/);
  assert.equal(calls.length, 2);
});

test('cancellation leaves installation intact and cleans up temporary resources', async () => {
  let mutated = false; let cleaned = false; let released = false;
  const result = await sync(options, {
    client: { checkVersion: async () => {}, list: async () => [], discover: async () => [], install: async () => { mutated = true; }, remove: async () => { mutated = true; } },
    clone: async () => ({ root: options.cwd, paths: [], tree: new Map(), cleanup: async () => { cleaned = true; } }),
    records: async () => ({ legacy: record }), confirm: async () => false, output: () => {}, lock: async () => async () => { released = true; },
  });
  assert.equal(result, 'cancelled');
  assert.equal(mutated, false); assert.equal(cleaned, true); assert.equal(released, true);
});

test('remote failure never prompts or deletes', async () => {
  let called = false;
  await assert.rejects(sync(options, {
    client: { checkVersion: async () => {}, list: async () => [], discover: async () => [], install: async () => { called = true; }, remove: async () => { called = true; } },
    clone: async () => { throw new Error('access denied'); }, records: async () => ({ legacy: record }), confirm: async () => { called = true; return true; }, output: () => {}, lock: async () => async () => {},
  }), /access denied/);
  assert.equal(called, false);
});
