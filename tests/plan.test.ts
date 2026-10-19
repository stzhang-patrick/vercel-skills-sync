import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPlan } from '../dist/plan.js';
import { parseArgs } from '../dist/cli.js';
import { belongsTo, repositoryOf, readRecords } from '../dist/vercel/records.js';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const hash = 'a'.repeat(40);
const remote = (name: string, treeHash = hash) => ({ name, path: `skills/${name}/SKILL.md`, treeHash, folderHash: 'c'.repeat(64) });
const record = (name: string, source = 'team/skills') => ({ source, sourceType: 'github', skillPath: `skills/${name}/SKILL.md`, skillFolderHash: hash });

test('classifies changes and never removes another source', () => {
  const plan = createPlan({ repository: 'team/skills', global: true,
    remote: [remote('review', 'b'.repeat(40)), remote('deploy'), remote('testing')],
    records: { review: record('review'), deploy: record('deploy'), legacy: record('legacy'), personal: record('personal', 'me/private') },
    deployed: new Set(['review', 'deploy', 'legacy', 'personal']),
  });
  assert.deepEqual(plan.map(({ name, action }) => [name, action]), [['review','Update'],['testing','Add'],['legacy','Remove'],['deploy','Unchanged']]);
});

test('same content is added when a target deployment is missing', () => {
  const plan = createPlan({ repository: 'team/skills', global: true, remote: [remote('review')], records: { review: record('review') }, deployed: new Set(['review']), missingTargets: new Set(['review']) });
  assert.equal(plan[0]?.action, 'Add');
});

test('missing tracking hashes cannot silently become unchanged', () => {
  assert.throws(() => createPlan({ repository: 'team/skills', global: true, remote: [remote('review')], records: { review: { ...record('review'), skillFolderHash: '' } }, deployed: new Set(['review']) }), /baseline/);
});

test('GitHub ownership accepts equivalent forms but not local or different hosts', () => {
  assert.equal(repositoryOf('git@github.com:Team/Skills.git'), 'team/skills');
  assert.equal(repositoryOf('https://github.com/Team/Skills.git'), 'team/skills');
  assert.equal(repositoryOf('https://gitlab.com/team/skills'), undefined);
  assert.equal(belongsTo({ source: 'team/skills', sourceType: 'local' }, 'team/skills'), false);
  assert.equal(belongsTo({ source: 'team/skills', sourceType: 'github', sourceUrl: 'https://github.com/other/skills.git' }, 'team/skills'), false);
});

test('incompatible, malformed and absent records are distinguished', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'skills-sync-records-'));
  try {
    assert.deepEqual(await readRecords(false, dir), {});
    await writeFile(join(dir,'skills-lock.json'), '{');
    await assert.rejects(readRecords(false, dir), /supports Vercel Skills CLI 1.7.2/);
    await writeFile(join(dir,'skills-lock.json'), JSON.stringify({ version: 99, skills: {} }));
    await assert.rejects(readRecords(false, dir), /Incompatible/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('requires one repository and validates supported options', () => {
  assert.deepEqual(parseArgs(['team/skills','-g','-a','claude-code','codex','-y']).agents, ['claude-code','codex']);
  for (const args of [[], ['https://github.com/team/skills'], ['team/skills','--prune'], ['team/skills','-a'], ['team/skills','other/repo']]) assert.throws(() => parseArgs(args));
});
