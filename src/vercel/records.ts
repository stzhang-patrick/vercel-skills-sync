import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const SUPPORTED_SKILLS_VERSION = '1.7.2';

export interface SkillRecord {
  source: string;
  sourceType: string;
  sourceUrl?: string;
  skillPath?: string;
  skillFolderHash?: string;
  computedHash?: string;
  ref?: string;
}

export function sanitizeName(name: string): string {
  // Adapted from skills@1.7.2 src/installer.ts. See UPSTREAM.md.
  return name.toLowerCase().replace(/[^a-z0-9._]+/g, '-').replace(/^[.\-]+|[.\-]+$/g, '').substring(0, 255) || 'unnamed-skill';
}

export function repositoryOf(source: string): string | undefined {
  let value = source.trim();
  const ssh = /^git@github\.com:([^\s]+)$/i.exec(value);
  if (ssh) value = ssh[1]!;
  else if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      if (url.hostname.toLowerCase() !== 'github.com' || url.username || url.password) return;
      value = url.pathname.replace(/^\//, '').replace(/\/$/, '');
    } catch { return; }
  }
  value = value.replace(/\.git$/i, '');
  if (!/^[\w.-]+\/[\w.-]+$/.test(value)) return;
  return value.toLowerCase();
}

export function belongsTo(record: SkillRecord, repository: string): boolean {
  // A local-path install is never owned by a remote just because its path resembles a slug.
  if (!['github', 'git'].includes(record.sourceType)) return false;
  const source = repositoryOf(record.source);
  const url = record.sourceUrl ? repositoryOf(record.sourceUrl) : undefined;
  return source === repository.toLowerCase() && (!record.sourceUrl || url === source);
}

export function recordPath(global: boolean, cwd: string): string {
  if (!global) return join(cwd, 'skills-lock.json');
  return process.env.XDG_STATE_HOME
    ? join(process.env.XDG_STATE_HOME, 'skills', '.skill-lock.json')
    : join(homedir(), '.agents', '.skill-lock.json');
}

export async function readRecords(global: boolean, cwd: string): Promise<Record<string, SkillRecord>> {
  const path = recordPath(global, cwd);
  let raw: string;
  try { raw = await readFile(path, 'utf8'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
  const incompatible = () => new Error(`Incompatible installation records: ${path}. This release supports Vercel Skills CLI ${SUPPORTED_SKILLS_VERSION} (global format 3, project format 1). Reinstall with the supported CLI or restore compatible records.`);
  let data: unknown;
  try { data = JSON.parse(raw); } catch { throw incompatible(); }
  if (!data || typeof data !== 'object') throw incompatible();
  const lock = data as Record<string, unknown>;
  if (lock.version !== (global ? 3 : 1) || !lock.skills || typeof lock.skills !== 'object' || Array.isArray(lock.skills)) throw incompatible();
  for (const value of Object.values(lock.skills)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw incompatible();
    const entry = value as Record<string, unknown>;
    if (typeof entry.source !== 'string' || typeof entry.sourceType !== 'string') throw incompatible();
    for (const field of ['sourceUrl', 'skillPath', 'skillFolderHash', 'computedHash', 'ref']) {
      if (entry[field] !== undefined && typeof entry[field] !== 'string') throw incompatible();
    }
  }
  return lock.skills as Record<string, SkillRecord>;
}
