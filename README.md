# vercel-skills-sync

English | [简体中文](README_ZH.md)

A lightweight wrapper around the [Vercel Skills CLI](https://github.com/vercel-labs/skills) that keeps local skills in sync with a GitHub repository.

## Example Usage

Suppose you installed three skills from `owner/repo`:

```text
owner/repo/
└── skills/
    ├── review/
    │   └── SKILL.md
    ├── deploy/
    │   └── SKILL.md
    └── legacy/
        └── SKILL.md
```

Your team then updates `review`, removes `legacy`, and adds `testing` through pull requests.

Run:

```bash
npx vercel-skills-sync owner/repo -g
```

The tool first shows a plan:

```text
owner/repo · Global installation

┌───────────┬─────────┐
│ Action    │ Skill   │
├───────────┼─────────┤
│ Update    │ review  │
│ Add       │ testing │
│ Remove    │ legacy  │
│ Unchanged │ deploy  │
└───────────┴─────────┘

1 update · 1 addition · 1 removal · 1 unchanged

Apply these changes? [y/N]
```

After confirmation, changed skills are updated, new skills are installed, and skills removed upstream are deleted locally. Unchanged skills are left as they are.

Sync includes all skills in the repository. Only skills installed from that repository can be removed. Updates and removals may overwrite or delete local edits.

## Installation and Usage

### Run with `npx`

```bash
npx vercel-skills-sync owner/repo -g
```

You can also use this command to install skills from `owner/repo` for the first time. All skills are listed as additions and installed after confirmation. No setup or repository registration is required.

### Optional Global Installation

```bash
npm install -g vercel-skills-sync
vercel-skills-sync owner/repo -g
```

No separate Vercel Skills CLI installation is required.

Private repositories use your existing Git or GitHub authentication. Sync follows the repository's default branch.

## Command and Options

```text
vercel-skills-sync owner/repo [-g] [-a <agents...>] [-y]
```

| Argument or option | Meaning |
| --- | --- |
| `owner/repo` | **Required** GitHub repository to sync |
| `-g` / `--global` | Install skills globally for the current user |
| `-y` / `--yes` | Skip confirmation and apply the sync plan |
| `-a` / `--agent` | Select target agents |

For example, target Codex and Claude Code:

```bash
npx vercel-skills-sync owner/repo -g -a codex claude-code
```

## Uninstallation

If you installed it globally:

```bash
npm uninstall -g vercel-skills-sync
```

Uninstalling removes the wrapper command and leaves installed skills in place.
