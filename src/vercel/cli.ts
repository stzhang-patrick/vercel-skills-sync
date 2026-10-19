import { execFile } from 'node:child_process';
import { promisify, stripVTControlCharacters } from 'node:util';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { SUPPORTED_SKILLS_VERSION, sanitizeName } from './records.js';

const exec = promisify(execFile);
export interface Output { stdout: string; stderr: string }
export interface InstalledSkill { name: string; path: string; scope: string; agents: string[]; source: string | null; sourceUrl: string | null; sourceType: string | null }
export interface Scope { global: boolean; cwd: string; agents: string[] }
export interface Snapshot { root: string; paths: string[]; tree: Map<string, string>; cleanup(): Promise<void> }

// list --json exposes display labels, not agent IDs. Most differ only in case
// or punctuation; these seven exceptions are the 1.7.2 registry projection.
const agentLabels: Record<string, string> = {
  'autohand-code': 'Autohand Code CLI', bob: 'IBM Bob', cortex: 'Cortex Code',
  devin: 'Devin for Terminal', grok: 'Grok Build', kilo: 'Kilo Code', roo: 'Roo Code',
};
const normalizedLabel = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

export async function command(file: string, args: string[], cwd: string): Promise<Output> {
  try {
    const result = await exec(file, args, { cwd, timeout: 120_000, maxBuffer: 32 * 1024 * 1024, encoding: 'utf8', windowsHide: true });
    return { stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const failure = error as Error & { stdout?: string; stderr?: string };
    const detail = stripVTControlCharacters(failure.stderr || failure.stdout || failure.message).trim();
    throw new Error(`${file === process.execPath ? 'Vercel Skills CLI' : file} failed: ${detail}`);
  }
}

export function parseRemoteListing(output: string): string[] {
  const plain = stripVTControlCharacters(output);
  const marker = plain.indexOf('Available Skills');
  if (marker < 0) throw new Error('Unsupported Vercel skill listing; no files have been changed.');
  const names = plain.slice(marker).split('\n').flatMap((line) => {
    const match = /^│ {4}(\S.*?)\s*$/.exec(line);
    return match ? [match[1]!] : [];
  });
  if (!names.length || new Set(names).size !== names.length) throw new Error('Empty or ambiguous Vercel skill listing; no files have been changed.');
  return names;
}

export class VercelCli {
  private entry: string;
  constructor() {
    const require = createRequire(import.meta.url);
    this.entry = join(dirname(require.resolve('skills/package.json')), 'bin', 'cli.mjs');
  }
  async checkVersion(): Promise<void> {
    const pkg = JSON.parse(await readFile(join(dirname(this.entry), '..', 'package.json'), 'utf8')) as { version?: string };
    if (pkg.version !== SUPPORTED_SKILLS_VERSION) throw new Error(`Expected skills@${SUPPORTED_SKILLS_VERSION}; found ${pkg.version ?? 'unknown'}. Reinstall vercel-skills-sync.`);
  }
  async run(args: string[], cwd: string): Promise<Output> { return command(process.execPath, [this.entry, ...args], cwd); }
  async list(scope: Scope, agent?: string): Promise<InstalledSkill[]> {
    const args = ['list', '--json', ...(scope.global ? ['-g'] : []), ...(agent ? ['-a', agent] : [])];
    const { stdout } = await this.run(args, scope.cwd);
    let data: unknown;
    try { data = JSON.parse(stdout); } catch { throw new Error('Incompatible Vercel list output.'); }
    if (!Array.isArray(data) || data.some((row) => !row || typeof row.name !== 'string' || typeof row.path !== 'string' || !Array.isArray(row.agents) || !(row.source === null || typeof row.source === 'string'))) throw new Error('Incompatible Vercel list output.');
    const rows = data as InstalledSkill[];
    // Upstream still includes canonical skills and other agents when -a is
    // present. Inspect its deployment labels instead of assuming a true filter.
    return agent ? rows.filter((row) => row.agents.some((label) => normalizedLabel(label) === normalizedLabel(agentLabels[agent] ?? agent))) : rows;
  }
  async discover(snapshot: Snapshot, cwd: string): Promise<string[]> {
    // A successfully cloned, genuinely empty skill tree is distinguishable from a CLI failure.
    if (!snapshot.paths.some((path) => path === 'SKILL.md' || path.endsWith('/SKILL.md'))) return [];
    const { stdout, stderr } = await this.run(['add', snapshot.root, '--list'], cwd);
    return parseRemoteListing(stdout + stderr);
  }
  async install(repository: string, names: string[], scope: Scope): Promise<void> {
    if (!names.length) return;
    const { stdout } = await this.run(['add', repository, '--skill', ...names, ...(scope.global ? ['-g'] : []), ...(scope.agents.length ? ['-a', ...scope.agents] : []), '-y', '--json'], scope.cwd);
    let results: unknown;
    try { results = JSON.parse(stdout); } catch { throw new Error('Installation did not return a compatible result. Removals were not started.'); }
    if (!Array.isArray(results) || names.some((name) => !results.some((row) => row?.name === name && row.status === 'installed')) || results.some((row) => row?.status === 'failed')) throw new Error('One or more skills were not installed successfully. Removals were not started.');
  }
  async remove(name: string, scope: Scope): Promise<void> {
    await this.run(['remove', name, ...(scope.global ? ['-g'] : []), ...(scope.agents.length ? ['-a', ...scope.agents] : []), '-y'], scope.cwd);
    const remaining = scope.agents.length
      ? (await Promise.all(scope.agents.map((agent) => this.list(scope, agent)))).flat()
      : await this.list(scope);
    if (remaining.some((row) => sanitizeName(row.name) === sanitizeName(name))) throw new Error(`Removal of ${name} was incomplete; stopping.`);
  }
}

export async function cloneRepository(repository: string, cwd: string): Promise<Snapshot> {
  const root = await mkdtemp(join(tmpdir(), 'skills-sync-'));
  try {
    const destinations = [
      () => command('git', ['clone', '--depth', '1', `https://github.com/${repository}.git`, root], cwd),
      () => command('gh', ['repo', 'clone', repository, root, '--', '--depth', '1'], cwd),
      () => command('git', ['-c', 'core.sshCommand=ssh -o BatchMode=yes', 'clone', '--depth', '1', `git@github.com:${repository}.git`, root], cwd),
    ];
    let cloned = false;
    for (const attempt of destinations) {
      try { await attempt(); cloned = true; break; }
      catch { await rm(root, { recursive: true, force: true }); }
    }
    if (!cloned) throw new Error(`Cannot access ${repository}. Check your existing Git/GitHub authentication and network connection. No removals were made.`);
    const paths = (await command('git', ['ls-files', '-z'], root)).stdout.split('\0').filter(Boolean);
    const tree = new Map<string, string>();
    tree.set('', (await command('git', ['rev-parse', 'HEAD^{tree}'], root)).stdout.trim());
    for (const line of (await command('git', ['ls-tree', '-r', '-t', '-z', 'HEAD'], root)).stdout.split('\0')) {
      const match = /^\d+ tree ([a-f0-9]+)\t([\s\S]+)$/.exec(line);
      if (match) tree.set(match[2]!, match[1]!);
    }
    return { root, paths, tree, cleanup: () => rm(root, { recursive: true, force: true }) };
  } catch (error) { await rm(root, { recursive: true, force: true }); throw error; }
}
