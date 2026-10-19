// Hash algorithm adapted from vercel-labs/skills@1.7.2, MIT.
// Copyright (c) 2026 Vercel, Inc. See UPSTREAM.md for the full license.
import { createHash } from 'node:crypto';
import { readFile, readdir, lstat, realpath } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { parse } from 'yaml';
import type { SkillRecord } from './records.js';
import { sanitizeName } from './records.js';

export async function computeSkillFolderHash(skillDir: string): Promise<string> {
  const files: { relativePath: string; content: Buffer }[] = [];
  async function collect(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    await Promise.all(entries.map(async (entry) => {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '.git' && entry.name !== 'node_modules') await collect(path);
      } else if (entry.isFile()) {
        files.push({ relativePath: relative(skillDir, path).split(sep).join('/'), content: await readFile(path) });
      }
    }));
  }
  await collect(skillDir);
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  const hash = createHash('sha256');
  for (const file of files) { hash.update(file.relativePath); hash.update(file.content); }
  return hash.digest('hex');
}

export interface RemoteSkill { name: string; path: string; folderHash: string; treeHash: string }

export async function resolveRemoteSkills(root: string, names: string[], tree: Map<string, string>, paths: string[]): Promise<RemoteSkill[]> {
  const byName = new Map<string, string[]>();
  for (const path of paths.filter((path) => path === 'SKILL.md' || path.endsWith('/SKILL.md'))) {
    if (path.split('/').some((part) => part === '.git' || part === 'node_modules')) continue;
    const full = resolve(root, path);
    if (!full.startsWith(resolve(root) + sep) || (await lstat(full)).isSymbolicLink()) throw new Error(`Unsafe remote skill path: ${path}`);
    const resolved = await realpath(full);
    if (!resolved.startsWith(await realpath(root) + sep)) throw new Error(`Remote skill escapes repository: ${path}`);
    const text = await readFile(full, 'utf8');
    const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
    if (!match) continue;
    let front: unknown;
    try { front = parse(match[1]!); } catch { continue; }
    if (!front || typeof front !== 'object' || typeof (front as { name?: unknown }).name !== 'string') continue;
    const name = (front as { name: string }).name;
    const existing = byName.get(name) ?? [];
    existing.push(path);
    byName.set(name, existing);
  }
  const sanitized = new Set<string>();
  const result: RemoteSkill[] = [];
  for (const name of names) {
    if (!name || /[\x00-\x1f\x7f]/.test(name) || name.startsWith('-')) throw new Error('Unsafe skill name in upstream listing.');
    const key = sanitizeName(name);
    if (sanitized.has(key)) throw new Error(`Ambiguous upstream skill name: ${name}`);
    sanitized.add(key);
    const matches = byName.get(name) ?? [];
    if (matches.length !== 1) throw new Error(`Cannot unambiguously resolve upstream skill ${name}; refusing to infer removals.`);
    const path = matches[0]!;
    const folder = dirname(path);
    const treeHash = tree.get(folder === '.' ? '' : folder);
    if (!treeHash) throw new Error(`Missing Git tree for ${name}`);
    result.push({ name, path, treeHash, folderHash: await computeSkillFolderHash(join(root, folder)) });
  }
  return result;
}

export function contentChanged(record: SkillRecord, remote: RemoteSkill, global: boolean): boolean {
  const baseline = global ? record.skillFolderHash : record.computedHash;
  if (!baseline || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(baseline)) {
    throw new Error(`No compatible content baseline for ${remote.name}. Reinstall it with skills@1.7.2 before syncing.`);
  }
  const latest = global && baseline.length === 40 ? remote.treeHash : remote.folderHash;
  return record.skillPath !== remote.path || baseline !== latest;
}
