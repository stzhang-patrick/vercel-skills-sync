import { belongsTo, sanitizeName } from './vercel/records.js';
import type { SkillRecord } from './vercel/records.js';
import { contentChanged } from './vercel/compare.js';
import type { RemoteSkill } from './vercel/compare.js';

export type Action = 'Update' | 'Add' | 'Remove' | 'Unchanged';
export interface PlanItem { action: Action; name: string; recordKey?: string }
export interface PlanInput {
  repository: string;
  global: boolean;
  remote: RemoteSkill[];
  records: Record<string, SkillRecord>;
  deployed: Set<string>;
  missingTargets?: Set<string>;
}

export function createPlan(input: PlanInput): PlanItem[] {
  const own = Object.entries(input.records).filter(([, record]) => belongsTo(record, input.repository));
  const byName = new Map<string, [string, SkillRecord]>();
  for (const [name, record] of own) {
    const key = sanitizeName(name);
    if (byName.has(key)) throw new Error(`Ambiguous installation records for ${name}.`);
    byName.set(key, [name, record]);
  }
  const remoteNames = new Set<string>();
  const plan: PlanItem[] = [];
  for (const remote of input.remote) {
    const key = sanitizeName(remote.name);
    remoteNames.add(key);
    const existing = byName.get(key);
    if (!existing || !input.deployed.has(key)) {
      plan.push({ action: 'Add', name: remote.name });
    } else if (contentChanged(existing[1], remote, input.global)) {
      plan.push({ action: 'Update', name: remote.name, recordKey: existing[0] });
    } else if (input.missingTargets?.has(key)) {
      plan.push({ action: 'Add', name: remote.name, recordKey: existing[0] });
    } else {
      plan.push({ action: 'Unchanged', name: remote.name, recordKey: existing[0] });
    }
  }
  for (const [name] of own) {
    if (!remoteNames.has(sanitizeName(name))) plan.push({ action: 'Remove', name, recordKey: name });
  }
  const order: Record<Action, number> = { Update: 0, Add: 1, Remove: 2, Unchanged: 3 };
  return plan.sort((a, b) => order[a.action] - order[b.action] || a.name.localeCompare(b.name));
}
