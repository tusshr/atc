export const FRAMEWORKS = {
  next: "Next.js",
  astro: "Astro",
  hono: "Hono",
  express: "Express",
  node: "Other Node project",
} as const;
export const PACKAGE_MANAGERS = ["npm", "pnpm", "yarn", "bun"] as const;
export const LINTERS = { eslint: "ESLint + Prettier", biome: "Biome", none: "None" } as const;
export const CASINGS = {
  kebab: { label: "kebab-case", example: "user-avatar.tsx" },
  camel: { label: "camelCase", example: "userAvatar.tsx" },
  pascal: { label: "PascalCase", example: "UserAvatar.tsx" },
  snake: { label: "snake_case", example: "user_avatar.tsx" },
} as const;
export const EXTRAS = {
  sortImports: { label: "Sort imports", hint: "grouped, alphabetized" },
  hooks: { label: "Pre-commit hooks", hint: "lint + format staged files" },
  commits: { label: "Commit message check", hint: "feat: · fix: · chore:" },
  release: { label: "Releases & CHANGELOG", hint: "npm run release" },
  vscode: { label: "VS Code settings", hint: "format on save" },
  docker: { label: "Dockerfile", hint: "production container image" },
} as const;

export type Framework = keyof typeof FRAMEWORKS;
export type PackageManager = (typeof PACKAGE_MANAGERS)[number];
export type Linter = keyof typeof LINTERS;
export type Casing = keyof typeof CASINGS;
export type Extra = keyof typeof EXTRAS;

/** What we found in the project before asking anything. */
export interface Project {
  name: string;
  framework: Framework;
  frameworkMajor: number | undefined;
  pm: PackageManager;
  deps: ReadonlySet<string>;
  scripts: Readonly<Record<string, string>>;
  typescript: boolean;
  tsMajor: number | undefined;
  tailwind: boolean;
  /** Absolute path of the enclosing git repository, if any. */
  gitRoot: string | undefined;
}

export interface Answers {
  framework: Framework;
  pm: PackageManager;
  linter: Linter;
  casing: Casing;
  extras: ReadonlySet<Extra>;
}

export interface Context extends Answers {
  project: Project;
  /** Build output folders for the chosen framework; ignored by linters, Docker and git. */
  outDirs: readonly string[];
  /** Command prefix that runs a locally installed binary, e.g. `npx --no`. */
  exec: string;
  /** Reads a project file, or returns undefined if it does not exist. */
  read(path: string): string | undefined;
}

/** What one tool adds to the project. Tools never touch the disk themselves. */
export interface Contribution {
  files?: Record<string, string>;
  devDependencies?: string[];
  scripts?: Record<string, string>;
  notes?: string[];
}

export interface Tool {
  id: string;
  enabled(ctx: Context): boolean;
  apply(ctx: Context): Contribution;
}

export interface Plan {
  files: Map<string, string>;
  devDependencies: string[];
  scripts: Record<string, string>;
  notes: string[];
}

export const OUT_DIRS: Record<Framework, readonly string[]> = {
  next: [".next", "out", "build"],
  astro: ["dist", ".astro"],
  hono: ["dist", "build"],
  express: ["dist", "build"],
  node: ["dist", "build"],
};

export const EXEC: Record<PackageManager, string> = {
  npm: "npx --no",
  pnpm: "pnpm exec",
  yarn: "yarn",
  bun: "bunx",
};

/** typescript-eslint supports TypeScript up to 6.x; TS 7 has no JS compiler API yet. */
export const eslintSupported = (p: Project): boolean =>
  !p.typescript || p.tsMajor === undefined || p.tsMajor < 7;

/** Husky installs hooks at the repo root; we only support running atc there (or outside git). */
export const hooksSupported = (p: Project, cwd: string): boolean =>
  p.gitRoot === undefined || p.gitRoot === cwd;

export const dockerSupported = (framework: Framework, pm: PackageManager): boolean =>
  (pm === "npm" || pm === "bun") && framework !== "astro";

export function createContext(project: Project, answers: Answers, read: Context["read"]): Context {
  return {
    ...answers,
    project,
    outDirs: OUT_DIRS[answers.framework],
    exec: EXEC[answers.pm],
    read,
  };
}

export function buildPlan(ctx: Context, tools: readonly Tool[]): Plan {
  const plan: Plan = { files: new Map(), devDependencies: [], scripts: {}, notes: [] };
  for (const tool of tools) {
    if (!tool.enabled(ctx)) continue;
    const c = tool.apply(ctx);
    for (const [path, content] of Object.entries(c.files ?? {})) plan.files.set(path, content);
    plan.devDependencies.push(...(c.devDependencies ?? []));
    Object.assign(plan.scripts, c.scripts);
    plan.notes.push(...(c.notes ?? []));
  }
  plan.devDependencies = [...new Set(plan.devDependencies)].filter((d) => !ctx.project.deps.has(d));
  return plan;
}

export const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
