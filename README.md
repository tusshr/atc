# atc

Set up linting, formatting, git hooks, commit checks, releases and Docker in any Node project, in one command.

```sh
npx @tusshr/atc
```

Run it inside an existing project, after `create-next-app`, `npm create astro`, `npm create hono` or `npm init`. atc detects what you have, asks five questions, shows exactly what it will change, and only writes after you confirm.

## What it asks

| Step               | Choices                                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| Framework          | Next.js, Astro, Hono, Express, other Node project (detected)                                             |
| Package manager    | npm, pnpm, yarn, bun (detected from the lockfile; bun also means the Bun runtime)                        |
| Linter & formatter | ESLint + Prettier, Biome, or none                                                                        |
| File naming        | kebab-case, camelCase, PascalCase, snake_case                                                            |
| Extras             | sort imports, pre-commit hooks, commit message check, releases & CHANGELOG, VS Code settings, Dockerfile |

## What you get

- **ESLint + Prettier**: a flat config tuned to your framework (`eslint-config-next`, `typescript-eslint`, `eslint-plugin-astro`), file naming rules, and Prettier with optional import sorting and the Tailwind and Astro plugins when you use them.
- **Biome**: one `biome.json` for linting, formatting and import sorting, with Next.js and React rules switched on for Next projects.
- **Pre-commit hooks**: Husky and lint-staged lint and format only the files you staged.
- **Commit message check**: rejects messages that don't follow [Conventional Commits](https://www.conventionalcommits.org), like `fixed stuff`.
- **Releases**: `npm run release` bumps the version from your commits, writes `CHANGELOG.md` and tags the release ([commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version)).
- **VS Code**: format on save and recommended extensions for the tools you picked.
- **Dockerfile**: Next.js standalone output, or a production image for Node and Bun servers.

## Non-interactive use

```sh
npx @tusshr/atc --yes                          # accept detected defaults
npx @tusshr/atc --yes --linter biome --casing camel
```

| Option          | Values                                  |
| --------------- | --------------------------------------- |
| `-y, --yes`     | Skip the questions and use the defaults |
| `--linter`      | `eslint`, `biome`, `none`               |
| `--casing`      | `kebab`, `camel`, `pascal`, `snake`     |
| `-h, --help`    | Show help                               |
| `-v, --version` | Show the version                        |

## Good to know

- atc **replaces** config files for the tools you pick. The flight plan marks those with `~` before anything is written. Run it on a clean git tree so you can review the diff.
- File naming rules apply to source folders (`src`, `app`, `components`, `lib`, `hooks`, `utils`), not to root config files. Next.js app router files keep the names Next.js requires.
- ESLint isn't offered on TypeScript 7 yet, because `typescript-eslint` supports TypeScript up to 6. Biome works with any version.
- Git hooks are set up only when atc runs at the repository root.
- Dockerfiles are generated for npm and bun projects.

## Requirements

Node.js 22.18 or newer.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Bugs and ideas go in [issues](https://github.com/tusshr/atc/issues).

## License

MIT
