import { createHash } from 'node:crypto';
import { open, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPlan } from './plan.js';
import type { PlanItem } from './plan.js';
import { confirmPlan, renderPreview } from './preview.js';
import { belongsTo, readRecords, recordPath, sanitizeName } from './vercel/records.js';
import { resolveRemoteSkills } from './vercel/compare.js';
import { cloneRepository, VercelCli } from './vercel/cli.js';
import type { Scope, Snapshot } from './vercel/cli.js';

export interface SyncOptions extends Scope { repository: string; yes: boolean; color?: boolean }
export interface SyncDependencies {
  client: Pick<VercelCli, 'checkVersion' | 'list' | 'discover' | 'install' | 'remove'>;
  clone: typeof cloneRepository;
  records: typeof readRecords;
  confirm: () => Promise<boolean>;
  output: (text: string) => void;
  lock: (scope: Scope) => Promise<() => Promise<void>>;
}

async function acquireLock(scope: Scope): Promise<() => Promise<void>> {
  const id = createHash('sha256').update(recordPath(scope.global, scope.cwd)).digest('hex');
  const path = join(tmpdir(), `skills-sync-${id}.lock`);
  let handle;
  try { handle = await open(path, 'wx', 0o600); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error(`Another sync may be running. If it has stopped, remove the stale lock: ${path}`);
    throw error;
  }
  try { await handle.writeFile(`${process.pid}\n`); }
  finally { await handle.close(); }
  return async () => { await unlink(path); };
}

export async function executePlan(plan: PlanItem[], options: SyncOptions, deps: Pick<SyncDependencies, 'client' | 'records' | 'output'>): Promise<void> {
  const installs = plan.filter((item) => item.action === 'Update' || item.action === 'Add');
  if (installs.length) {
    await deps.client.install(options.repository, installs.map((item) => item.name), options);
    const records = await deps.records(options.global, options.cwd);
    for (const item of installs) {
      const entry = Object.entries(records).find(([key]) => sanitizeName(key) === sanitizeName(item.name));
      if (!entry || !belongsTo(entry[1], options.repository)) throw new Error(`Installation ownership was not recorded for ${item.name}. Removals were not started.`);
    }
    deps.output(`Installed: ${installs.map((item) => item.name).join(', ')}\n`);
  }
  for (const item of plan.filter((item) => item.action === 'Remove')) {
    const records = await deps.records(options.global, options.cwd);
    const record = records[item.recordKey ?? item.name];
    if (!record || !belongsTo(record, options.repository)) throw new Error(`Source ownership changed for ${item.name}; refusing to remove it.`);
    await deps.client.remove(item.name, options);
    deps.output(`Removed: ${item.name}\n`);
  }
}

export async function sync(options: SyncOptions, overrides: Partial<SyncDependencies> = {}): Promise<'synced' | 'cancelled' | 'unchanged'> {
  const deps: SyncDependencies = {
    client: overrides.client ?? new VercelCli(), clone: cloneRepository, records: readRecords,
    confirm: confirmPlan, output: (text) => process.stdout.write(text), lock: acquireLock, ...overrides,
  };
  await deps.client.checkVersion();
  const release = await deps.lock(options);
  let snapshot: Snapshot | undefined;
  try {
    const records = await deps.records(options.global, options.cwd);
    const installed = await deps.client.list(options);
    // Let the original CLI validate agents and resolve their native deployment locations.
    const targetLists = await Promise.all(options.agents.map((agent) => deps.client.list(options, agent)));
    const deployed = new Set(installed.map((row) => sanitizeName(row.name)));
    snapshot = await deps.clone(options.repository, options.cwd);
    const names = await deps.client.discover(snapshot, options.cwd);
    const remote = await resolveRemoteSkills(snapshot.root, names, snapshot.tree, snapshot.paths);
    const missingTargets = new Set(names.filter((name) => targetLists.some((rows) => !rows.some((row) => sanitizeName(row.name) === sanitizeName(name)))).map(sanitizeName));
    const plan = createPlan({ repository: options.repository, global: options.global, remote, records, deployed, missingTargets });
    deps.output(renderPreview(options.repository, options.global, plan, options.color));
    if (plan.every((item) => item.action === 'Unchanged')) {
      deps.output('\nAlready in sync.\n');
      return 'unchanged';
    }
    if (!options.yes && !await deps.confirm()) { deps.output('\nSync cancelled.\n'); return 'cancelled'; }
    await executePlan(plan, options, deps);
    deps.output('\nSync complete.\n');
    return 'synced';
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}\nSync stopped. Completed operations are not rolled back; resolve the problem and run again.`);
  } finally {
    try { await snapshot?.cleanup(); } finally { await release(); }
  }
}
