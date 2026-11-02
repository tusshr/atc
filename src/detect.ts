import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { basename, join } from "node:path";

import { FRAMEWORKS, type Framework, type PackageManager, type Project } from "./plan.ts";

interface PackageJson {
  name?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const LOCKFILES: [string, PackageManager][] = [
  ["bun.lock", "bun"],
  ["bun.lockb", "bun"],
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["package-lock.json", "npm"],
];

/** "^16.4.3" → 16, "~4" → 4, "latest" → undefined */
const major = (range: string | undefined): number | undefined => {
  const m = range?.match(/\d+/)?.[0];
  return m === undefined ? undefined : Number(m);
};

export function readPackageJson(cwd: string): PackageJson | undefined {
  const path = join(cwd, "package.json");
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8")) as PackageJson;
}

export function detectProject(cwd: string, pkg: PackageJson): Project {
  const all = { ...pkg.dependencies, ...pkg.devDependencies };
  const has = (d: string) => d in all;
  const framework =
    (Object.keys(FRAMEWORKS) as Framework[]).find((f) => f !== "node" && has(f)) ?? "node";
  return {
    name: pkg.name ?? basename(cwd),
    framework,
    frameworkMajor: framework === "node" ? undefined : major(all[framework]),
    pm: LOCKFILES.find(([file]) => existsSync(join(cwd, file)))?.[1] ?? "npm",
    deps: new Set(Object.keys(all)),
    scripts: pkg.scripts ?? {},
    typescript: existsSync(join(cwd, "tsconfig.json")),
    tsMajor: major(all.typescript),
    tailwind: has("tailwindcss"),
    gitRoot: gitRoot(cwd),
  };
}

function gitRoot(cwd: string): string | undefined {
  try {
    const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return realpathSync(root);
  } catch {
    return undefined; // not a repo, or git isn't installed
  }
}
