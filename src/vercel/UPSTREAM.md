# Vercel Skills CLI compatibility

This release is coupled to the exact npm package `skills@1.7.2` from
[vercel-labs/skills](https://github.com/vercel-labs/skills).

The following small, read-only pieces are adapted from that release:

- `compare.ts`: `computeSkillFolderHash` and recursive file collection from
  `src/local-lock.ts`; Git tree versus recorded folder-hash comparison from
  `src/update.ts` and `src/skill-lock.ts`.
- `records.ts`: `sanitizeName` from `src/installer.ts`, and the record paths
  and schemas from `src/skill-lock.ts` and `src/local-lock.ts`.

Adaptations add TypeScript types, fail-closed schema validation, source
ownership checks, and comparison against a temporary Git clone. We do not
invoke the upstream lock readers because they can interpret incompatible
or malformed records as an empty installation. We do not write or migrate
upstream records. Installation and removal use the bundled upstream CLI.
Discovery uses its `add --list` output; this text contract is tested against
the installed package, rather than treated as a public SDK.

`cli.ts` also projects the seven exceptional agent ID/display-label pairs
from `src/agents.ts`. No agent installation paths are maintained here.
The original `list -a --json` can still include canonical skills and other
agents, so deployment checks filter its returned labels explicitly.

When upgrading `skills`, review these source files and run the compatibility
suite against the actual npm package, on Windows, macOS, and Linux. Recheck
record formats, listing output, JSON install results, name sanitization,
hashes, selected-agent deployments, and removal behavior.

## Upstream license

MIT License

Copyright (c) 2026 Vercel, Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
