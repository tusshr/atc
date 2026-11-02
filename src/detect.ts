import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import { FRAMEWORKS, type Framework, major, type PackageManager, type Project } from "./plan.ts";

interface PackageJson {
  name?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  packageManager?: string;
}

const LOCKFILES: [string, PackageManager][] = [
  ["bun.lock", "bun"],
  ["bun.lockb", "bun"],
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["package-lock.json", "npm"],
];

const PMS: readonly PackageManager[] = ["npm", "pnpm", "yarn", "bun"];

/**
 * The `packageManager` field wins; otherwise the nearest lockfile, searching up to the
 * repository root so packages inside a workspace use the workspace's package manager.
 */
function detectPm(cwd: string, pkg: PackageJson, root: string | undefined): PackageManager {
  const declared = pkg.packageManager?.split("@")[0] as PackageManager | undefined;
  if (declared && PMS.includes(declared)) return declared;
  for (let dir = cwd; ; dir = dirname(dir)) {
    const found = LOCKFILES.find(([file]) => existsSync(join(dir, file)));
    if (found) return found[1];
    if (dir === root || dir === dirname(dir) || root === undefined) return "npm";
  }
}

export function readPackageJson(cwd: string): PackageJson | undefined {
  const path = join(cwd, "package.json");
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8")) as PackageJson;
}

export function detectProject(cwd: string, pkg: PackageJson): Project {
  const all = { ...pkg.dependencies, ...pkg.devDependencies };
  const has = (d: string) => d in all;
  const root = gitRoot(cwd);
  const framework =
    (Object.keys(FRAMEWORKS) as Framework[]).find((f) => f !== "node" && has(f)) ?? "node";
  return {
    name: pkg.name ?? basename(cwd),
    framework,
    frameworkMajor: framework === "node" ? undefined : major(all[framework]),
    pm: detectPm(cwd, pkg, root),
    deps: new Set(Object.keys(all)),
    versions: all,
    scripts: pkg.scripts ?? {},
    typescript: existsSync(join(cwd, "tsconfig.json")),
    tsMajor: major(all.typescript),
    tailwind: has("tailwindcss"),
    gitRoot: root,
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
