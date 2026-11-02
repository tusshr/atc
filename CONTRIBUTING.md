# Contributing to atc

Thanks for helping. This guide covers everything you need to send a pull request.

## Setup

You need Node.js 24 (see `.nvmrc`).

```sh
git clone https://github.com/tusshr/atc && cd atc
npm install
```

Run your working copy in any project. There's no build step during development, because Node runs the TypeScript directly:

```sh
cd ~/some-project
node ~/path/to/atc/src/cli.ts
```

## Scripts

| Script                          | What it does                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------ |
| `npm run dev`                   | Run the CLI from source                                                                          |
| `npm test`                      | Unit tests (fast, no network)                                                                    |
| `npm run smoke`                 | Build, then run atc against real Next.js, Astro, Hono and Express projects (slow, needs network) |
| `npm run typecheck`             | Type-check with `tsc`                                                                            |
| `npm run check` / `npm run fix` | Lint and format with Biome                                                                       |
| `npm run build`                 | Compile `src/` to `dist/` (only needed for publishing)                                           |

## How the code is organized

```
src/
  cli.ts        flags, questions, the run checklist
  ui.ts         everything that prints: flight strip, prompts, flight plan, checklist
  detect.ts     reads package.json, lockfiles, tsconfig, git
  plan.ts       shared types and buildPlan()
  tools/        one file per tool
templates/      files copied as-is (the commit-msg hook)
test/           unit tests and the smoke test
```

The core idea: **tools never touch the disk.** Each tool looks at the answers and returns what it wants to add. `buildPlan()` merges everything into one plan, the CLI shows it, and only writes it after the user confirms. That's why tools are easy to unit test.

## Adding a tool

1. Create `src/tools/my-tool.ts`:

   ```ts
   import type { Tool } from "../plan.ts";

   export const myTool: Tool = {
     id: "my-tool",
     enabled: (ctx) => ctx.extras.has("myTool"),
     apply: (ctx) => ({
       files: { "my-tool.config.json": "{}\n" },
       devDependencies: ["my-tool"],
       scripts: { "my-tool": "my-tool run" },
       notes: [], // shown after setup, e.g. a manual step
     }),
   };
   ```

2. Register it in `src/tools/index.ts`.
3. If it needs a new choice, add it to `EXTRAS` (or another constant) in `src/plan.ts`.
4. Add a test in `test/plan.test.ts` that builds a plan and checks the files it produces.

Read existing files with `ctx.read(path)`; it returns `undefined` if the file doesn't exist.

## Code style

- Biome formats and lints everything; the pre-commit hook runs it on staged files.
- Use only TypeScript syntax Node can strip: no `enum`, `namespace` or constructor parameter properties. `tsc` enforces this with `erasableSyntaxOnly`.
- Import local files with the `.ts` extension. The build rewrites them to `.js`.

## Commit messages

Commits must follow [Conventional Commits](https://www.conventionalcommits.org); a git hook checks them. Releases are generated from these messages, so the type matters:

| Type                                           | Use for                                                                     | Release |
| ---------------------------------------------- | --------------------------------------------------------------------------- | ------- |
| `feat:`                                        | New option, tool or framework                                               | minor   |
| `fix:`                                         | Bug fix                                                                     | patch   |
| `feat!:` / `fix!:`                             | Changes what existing users get (different generated files, removed option) | major   |
| `docs:`, `test:`, `refactor:`, `chore:`, `ci:` | Everything else                                                             | none    |

## Releases

Maintainers don't release by hand. On every push to `main`, release-please updates a "chore: release x.y.z" pull request with the version bump and changelog. Merging that PR tags the release, creates the GitHub release and publishes to npm with provenance.

While atc is on 0.x, breaking changes bump the minor version and features bump the patch version.

### One-time npm setup (maintainers)

1. Add an `NPM_TOKEN` repository secret (an npm granular token with publish access) for the first release.
2. After the first publish, open the package settings on npmjs.com, add this repository as a trusted publisher with the `release.yml` workflow, then delete the `NPM_TOKEN` secret.
