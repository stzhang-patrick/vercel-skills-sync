import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { computeSkillFolderHash } from '../dist/vercel/compare.js';
import { parseRemoteListing } from '../dist/vercel/cli.js';

const exec = promisify(execFile);
const project = fileURLToPath(new URL('..', import.meta.url));
const cli = join(project, 'dist/cli.js');
const require = createRequire(import.meta.url);
const upstream = resolve(require.resolve('skills/package.json'), '../bin/cli.mjs');

test('unknown remote listing fails closed', () => {
  assert.throws(() => parseRemoteListing('network failure'), /Unsupported/);
  assert.throws(() => parseRemoteListing('Available Skills\n'), /Empty/);
});

for (const global of [true, false]) {
  test(`actual skills@1.7.2: ${global ? 'global' : 'project'} sync, hash compatibility, unchanged preservation, selected-agent repair and deletion`, { timeout: 120_000 }, async () => {
    const root = await mkdtemp(join(tmpdir(), 'skills-sync-e2e-'));
    const repo = join(root, 'remote'); const home = join(root, 'user'); const cwd = join(root, 'project');
    const git = async (args: string[]) => (await exec('git', ['-C', repo, ...args])).stdout.trim();
    const put = async (name: string, version: string) => {
      const path = join(repo, 'skills', name); await mkdir(path, { recursive: true });
      await writeFile(join(path, 'SKILL.md'), `---\nname: ${name}\ndescription: Compatibility test fixture\n---\n\n${name}-${version}\n`);
      await mkdir(join(path, 'references'), { recursive: true });
      await writeFile(join(path, 'references/checklist.md'), `checklist-${version}\n`);
    };
    try {
      await mkdir(repo); await mkdir(home); await mkdir(cwd);
      await exec('git', ['init', '-b', 'main', repo]);
      await git(['config','user.name','Compatibility Test']); await git(['config','user.email','test@example.invalid']);
      for (const name of ['review','deploy','legacy']) await put(name, 'v1');
      await git(['add','.']); await git(['commit','-m','v1']);
      const config = join(root, 'gitconfig');
      await writeFile(config, `[url "${pathToFileURL(repo).href}/"]\n\tinsteadOf = https://github.com/test/team-skills.git\n`);
      const env: NodeJS.ProcessEnv = {};
      for (const key of ['PATH','Path','HOME','USERPROFILE','SYSTEMROOT','SystemRoot','WINDIR','TMP','TEMP','TMPDIR','LANG']) if (process.env[key]) env[key] = process.env[key];
      Object.assign(env, {
        SKILLS_TEST_USERDIR: home, SKILLS_TEST_REPO: repo,
        NODE_OPTIONS: `--import=${new URL('./fixtures/isolate.mjs', import.meta.url).href}`,
        XDG_STATE_HOME: join(home,'.state'), XDG_CONFIG_HOME: join(home,'.config'),
        CODEX_HOME: join(home,'.codex'), CLAUDE_CONFIG_DIR: join(home,'.claude'),
        GIT_CONFIG_GLOBAL: config, GIT_CONFIG_NOSYSTEM: '1',
        NO_COLOR: '1', DISABLE_TELEMETRY: '1', DO_NOT_TRACK: '1', CI: '1',
      });
      await mkdir(env.CLAUDE_CONFIG_DIR!, { recursive: true });
      await mkdir(env.CODEX_HOME!, { recursive: true });
      const run = (entry: string, args: string[]) => exec(process.execPath, [entry, ...args], { cwd, env, timeout: 40_000, maxBuffer: 8*1024*1024 });
      const args = ['test/team-skills', ...(global ? ['-g'] : []), '-a','claude-code','codex','-y'];
      const first = await run(cli, args);
      assert.match(first.stdout, /3 additions/);
      const center = join(global ? home : cwd, '.agents/skills');
      const claude = join(global ? home : cwd, '.claude/skills');
      const before = (await stat(join(center,'deploy/SKILL.md'))).mtimeMs;
      const lockPath = global ? join(home,'.state/skills/.skill-lock.json') : join(cwd,'skills-lock.json');
      const lock = JSON.parse(await readFile(lockPath, 'utf8'));
      assert.equal(lock.skills.review.source, 'test/team-skills');
      assert.equal(lock.skills.review.ref, undefined);
      if (global) assert.equal(lock.skills.review.skillFolderHash, await git(['rev-parse','HEAD:skills/review']));
      else assert.equal(lock.skills.review.computedHash, await computeSkillFolderHash(join(repo,'skills/review')));
      // A personal skill with a different source must survive.
      lock.skills.personal = { ...lock.skills.review, source: 'me/personal', sourceUrl: 'https://github.com/me/personal.git' };
      await writeFile(lockPath, JSON.stringify(lock));
      await mkdir(join(center,'personal'), { recursive: true });
      await writeFile(join(center,'personal/SKILL.md'), '---\nname: personal\ndescription: Personal skill\n---\n');
      await put('review','v2'); await put('testing','v1'); await rm(join(repo,'skills/legacy'), { recursive: true });
      await git(['add','-A']); await git(['commit','-m','v2']);
      const second = await run(cli,args);
      assert.match(second.stdout,/1 update · 1 addition · 1 removal · 1 unchanged/);
      assert.match(await readFile(join(center,'review/SKILL.md'),'utf8'),/review-v2/);
      assert.match(await readFile(join(claude,'testing/SKILL.md'),'utf8'),/testing-v1/);
      await assert.rejects(stat(join(center,'legacy')), { code: 'ENOENT' });
      assert.equal((await stat(join(center,'deploy/SKILL.md'))).mtimeMs, before);
      assert.match(await readFile(join(center,'personal/SKILL.md'),'utf8'),/Personal skill/);
      const repeat = await run(cli,args); assert.match(repeat.stdout,/Already in sync/);
      // An unchanged skill must still deploy to a newly selected agent.
      await mkdir(join(home,'.codeium/windsurf'), { recursive: true });
      await run(cli,['test/team-skills',...(global ? ['-g'] : []),'-a','windsurf','-y']);
      const windsurf = global ? join(home,'.codeium/windsurf/skills') : join(cwd,'.windsurf/skills');
      assert.match(await readFile(join(windsurf,'review/SKILL.md'),'utf8'),/review-v2/);
      // The wrapper's installation must remain readable by the original CLI.
      const nativeList = await run(upstream,['list',...(global ? ['-g'] : []),'--json']);
      assert.ok(JSON.parse(nativeList.stdout).some((row: { name: string }) => row.name === 'review'));
      // Noninteractive use without --yes fails before changing a pending installation.
      await put('review','v3'); await git(['add','.']); await git(['commit','-m','v3']);
      await assert.rejects(run(cli,args.filter((arg) => arg !== '-y')), /Confirmation requires/);
      assert.match(await readFile(join(windsurf,'review/SKILL.md'),'utf8'),/review-v2/);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
}
