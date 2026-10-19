// Used only by child-process integration tests. Never imported by the shipped CLI.
import os from 'node:os';
import { syncBuiltinESMExports } from 'node:module';
import { execFileSync } from 'node:child_process';
const home = process.env.SKILLS_TEST_USERDIR;
const repo = process.env.SKILLS_TEST_REPO;
if (!home || !repo) throw new Error('Missing test isolation paths');
os.homedir = () => home;
syncBuiltinESMExports();
globalThis.fetch = async (input) => {
  const url = new URL(typeof input === 'string' ? input : input.url ?? String(input));
  if (url.hostname === 'api.github.com' && url.pathname === '/repos/test/team-skills') {
    return Response.json({ private: true, default_branch: 'main' });
  }
  const prefix = '/repos/test/team-skills/git/trees/';
  if (url.hostname === 'api.github.com' && url.pathname.startsWith(prefix)) {
    const ref = decodeURIComponent(url.pathname.slice(prefix.length));
    const git = (args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
    try {
      const tree = git(['ls-tree', '-r', '-t', ref]).split('\n').filter(Boolean).map((line) => {
        const m = /^(\d+) (\w+) ([a-f0-9]+)\t(.+)$/.exec(line);
        return { mode: m[1], type: m[2], sha: m[3], path: m[4] };
      });
      return Response.json({ sha: git(['rev-parse', `${ref}^{tree}`]), tree, truncated: false });
    } catch { return new Response('{}', { status: 404 }); }
  }
  throw new Error('External network is disabled in compatibility tests');
};
