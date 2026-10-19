# vercel-skills-sync

[English](README.md) | 简体中文

[Vercel Skills CLI](https://github.com/vercel-labs/skills) 的轻量封装，让本地 skills 与 GitHub 仓库保持同步。

## 使用示例

假设你从 `owner/repo` 安装了三个 skills：

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

随后，团队通过 PR 更新了 `review`、移除了 `legacy`，并新增了 `testing`。

执行：

```bash
npx vercel-skills-sync owner/repo -g
```

工具首先显示变更计划：

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

确认后，工具会更新有变化的 skills、安装新增的 skills，并从本地移除上游已删除的 skills。未变化的 skills 保持原样。

同步涵盖仓库中的全部 skills。移除仅限于从该仓库安装的 skills。更新和移除可能覆盖或删除本地修改。

## 安装与使用

### 通过 `npx` 运行

```bash
npx vercel-skills-sync owner/repo -g
```

也可以用这条命令首次安装 `owner/repo` 中的 skills。所有 skills 都会列为新增，确认后安装。无需初始化或登记仓库。

### 可选：全局安装

```bash
npm install -g vercel-skills-sync
vercel-skills-sync owner/repo -g
```

无需单独安装 Vercel Skills CLI。

私有仓库复用现有的 Git 或 GitHub 认证。同步跟随仓库默认分支。

## 命令与参数

```text
vercel-skills-sync owner/repo [-g] [-a <agents...>] [-y]
```

| 参数 | 含义 |
| --- | --- |
| `owner/repo` | **必填**，要同步的 GitHub 仓库 |
| `-g` / `--global` | 为当前用户全局安装 skills |
| `-y` / `--yes` | 跳过确认，执行同步计划 |
| `-a` / `--agent` | 选择目标 agents |

例如，指定 Codex 和 Claude Code：

```bash
npx vercel-skills-sync owner/repo -g -a codex claude-code
```

## 卸载

如果进行了全局安装：

```bash
npm uninstall -g vercel-skills-sync
```

卸载会移除包装工具命令，保留已安装的 skills。
