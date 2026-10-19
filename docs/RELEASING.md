# Releasing

Releases are published from version tags through `.github/workflows/publish.yml`.

## One-time setup

The npm package `vercel-skills-sync` must trust this GitHub Actions publisher:

| Field | Value |
| --- | --- |
| GitHub owner | `stzhang-patrick` |
| Repository | `vercel-skills-sync` |
| Workflow filename | `publish.yml` |
| Environment | `npm` |
| Permission | Allow direct publishing (`npm publish`) |

The GitHub repository has an `npm` environment. No npm token secret is required.
A newly configured trusted publisher must complete its first successful publish
within two days; if it expires, recreate the trusted publisher configuration.

## Publish a stable version

Start from a clean, up-to-date `main` checkout. Wait for CI to pass before tagging.

```bash
git switch main
git pull --ff-only
npm ci --ignore-scripts
npm run typecheck
npm test
npm version patch
git push origin main
git push origin "v$(node -p 'require("./package.json").version')"
```

Use `npm version minor` or `npm version major` for the corresponding version bump.
`npm version` updates both manifests, creates a commit, and creates the matching
`vX.Y.Z` tag. The final command pushes only the newly created version tag.

The Publish workflow checks that the tag matches `package.json`, runs the tests,
and publishes to npm with build provenance. This workflow accepts stable versions
only. Each npm version can be published once; fix a failed release before retrying,
and do not reuse a version that has already been published.

Inspect the Publish run on GitHub Actions, then verify:

```bash
npm view vercel-skills-sync version bin
npx vercel-skills-sync@latest --version
```

If npm accepts a publish but the version is not immediately visible, wait for
registry processing before retrying. Avoid publishing the same version again.
