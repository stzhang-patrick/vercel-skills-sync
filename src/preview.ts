import Table from 'cli-table3';
import { styleText } from 'node:util';
import { createInterface } from 'node:readline/promises';
import type { Action, PlanItem } from './plan.js';

export function renderPreview(repository: string, global: boolean, plan: PlanItem[], color = false): string {
  const colors = { Update: 'yellow', Add: 'green', Remove: 'red', Unchanged: 'gray' } as const;
  const table = new Table({ head: ['Action', 'Skill'], style: { head: [], border: [] }, wordWrap: true });
  for (const item of plan) {
    const action = color ? styleText(colors[item.action], item.action, { validateStream: false }) : item.action;
    table.push([action, item.name]);
  }
  const count = (action: Action) => plan.filter((item) => item.action === action).length;
  const summary = `${count('Update')} update${count('Update') === 1 ? '' : 's'} · ${count('Add')} addition${count('Add') === 1 ? '' : 's'} · ${count('Remove')} removal${count('Remove') === 1 ? '' : 's'} · ${count('Unchanged')} unchanged`;
  return `${repository} · ${global ? 'Global' : 'Project'} installation\n\n${table.toString()}\n\n${summary}\n`;
}

export async function confirmPlan(): Promise<boolean> {
  if (!process.stdin.isTTY) throw new Error('Confirmation requires an interactive terminal. Run with --yes for unattended sync.');
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try { return /^y(?:es)?$/i.test((await prompt.question('\nApply these changes? [y/N] ')).trim()); }
  catch { return false; }
  finally { prompt.close(); }
}
