#!/usr/bin/env node
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { sync } from './sync.js';
import type { SyncOptions } from './sync.js';

const help = `Usage: vercel-skills-sync owner/repo [-g] [-a <agents...>] [-y]

Sync all discoverable skills from a GitHub repository.

  -g, --global       Install for the current user (default: current project)
  -a, --agent        Target agents, using Vercel Skills CLI identifiers
  -y, --yes          Apply without confirmation
  -h, --help         Show help
  -v, --version      Show version

Only additions and changed skills are installed. Upstream removals are
applied after all installations succeed. Local edits may be overwritten.
`;

export function parseArgs(args: string[], cwd = process.cwd()): SyncOptions {
  const repository = args[0];
  if (!repository || !/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(repository) || repository.endsWith('/.') || repository.endsWith('/..') || repository.endsWith('.git')) throw new Error('Specify a GitHub repository as owner/repo (without a URL, .git suffix, branch, or tag).');
  const options: SyncOptions = { repository, global: false, yes: false, agents: [], cwd: resolve(cwd) };
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-g' || arg === '--global') options.global = true;
    else if (arg === '-y' || arg === '--yes') options.yes = true;
    else if (arg === '-a' || arg === '--agent') {
      const start = options.agents.length;
      while (i + 1 < args.length && !args[i + 1]!.startsWith('-')) options.agents.push(args[++i]!);
      if (options.agents.length === start) throw new Error(`${arg} requires at least one agent.`);
    } else throw new Error(`Unknown option: ${arg}. Run vercel-skills-sync --help.`);
  }
  options.agents = [...new Set(options.agents)];
  options.color = !('NO_COLOR' in process.env) && (process.env.FORCE_COLOR !== undefined ? process.env.FORCE_COLOR !== '0' : Boolean(process.stdout.isTTY));
  return options;
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  if (args.length === 1 && ['-h', '--help'].includes(args[0]!)) { process.stdout.write(help); return; }
  if (args.length === 1 && ['-v', '--version'].includes(args[0]!)) {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
    process.stdout.write(pkg.version + '\n'); return;
  }
  await sync(parseArgs(args));
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href) {
  main().catch((error: unknown) => { process.stderr.write(`vercel-skills-sync: ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
}
