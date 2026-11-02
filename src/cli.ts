#!/usr/bin/env node
import { exec, execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs, promisify } from "node:util";

import { detectProject, readPackageJson } from "./detect.ts";
import {
  type Answers,
  biomeBlocker,
  buildPlan,
  CASINGS,
  type Casing,
  createContext,
  dockerSupported,
  EXTRAS,
  type Extra,
  eslintBlocker,
  FRAMEWORKS,
  type Framework,
  hooksSupported,
  json,
  LINTERS,
  type Linter,
  PACKAGE_MANAGERS,
  type PackageManager,
  type Project,
} from "./plan.ts";
import { TOOLS } from "./tools/index.ts";
import * as ui from "./ui.ts";

const VERSION: string = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).version;

const HELP = `
  atc v${VERSION}
  Set up linting, formatting, git hooks, commit checks, releases and Docker in a Node project.

  Usage
    npx @tusshr/atc [options]

  Options
    -y, --yes             Accept detected defaults without asking
        --linter <name>   eslint | biome | none
        --casing <name>   kebab | camel | pascal | snake
    -h, --help            Show this help
    -v, --version         Show the version

  Run it in the project folder, next to package.json.
`;

const sh = promisify(exec);

async function run(cmd: string, cwd: string): Promise<void> {
  try {
    await sh(cmd, { cwd, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, FORCE_COLOR: "0" } });
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string };
    throw new ui.TaskError(`Command failed: ${cmd}`, `${e.stdout ?? ""}${e.stderr ?? ""}`);
  }
}

/** Resolves if `bin --version` runs; rejects with a clear message otherwise. */
function available(bin: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(bin, ["--version"], { shell: process.platform === "win32" }, (error) =>
      error
        ? reject(
            new ui.TaskError(
              `${bin} isn't installed or isn't on your PATH. Nothing was changed.`,
              "",
            ),
          )
        : resolve(),
    );
  });
}

function oneOf<T extends string>(
  flag: string,
  value: string | undefined,
  allowed: readonly T[],
): T | undefined {
  if (value === undefined) return undefined;
  if ((allowed as readonly string[]).includes(value)) return value as T;
  return ui.fail(`--${flag} must be one of: ${allowed.join(", ")}`);
}

/** Asks each question in order, or prints the default when running with --yes. */
async function ask(
  project: Project,
  cwd: string,
  yes: boolean,
  preset: Partial<Answers>,
): Promise<Answers> {
  let step = 0;
  const pick = async <T extends string>(
    title: string,
    choices: ui.Choice<T>[],
    initial: T,
    layout: "row" | "column",
    presetValue?: T,
    extra: { detail?: (v: T) => string; display?: (v: T) => string } = {},
  ): Promise<T> => {
    step++;
    const value = presetValue ?? initial;
    if (yes || presetValue !== undefined) {
      const label =
        extra.display?.(value) ?? choices.find((x) => x.value === value)?.label ?? value;
      process.stdout.write(`${ui.stepLine(step, title, label)}\n`);
      return value;
    }
    return ui.select({ step, title, choices, initial, layout, ...extra });
  };

  const framework = await pick<Framework>(
    "Framework",
    Object.entries(FRAMEWORKS).map(([value, label]) => ({
      value: value as Framework,
      label,
      hint: value === project.framework ? "detected" : undefined,
    })),
    project.framework,
    "column",
    preset.framework,
  );

  const runtime = (pm: PackageManager) => (pm === "bun" ? "Bun runtime" : "Node runtime");
  const pm = await pick<PackageManager>(
    "Package manager",
    PACKAGE_MANAGERS.map((value) => ({ value, label: value, hint: runtime(value) })),
    project.pm,
    "row",
    preset.pm,
    { display: (v) => `${v} · ${runtime(v)}` },
  );

  const blocked: Partial<Record<Linter, string>> = {
    eslint: eslintBlocker(project),
    biome: biomeBlocker(project),
  };
  if (preset.linter && blocked[preset.linter]) {
    ui.fail(`--linter ${preset.linter} isn't available here: it ${blocked[preset.linter]}.`);
  }
  const linter = await pick<Linter>(
    "Linter & formatter",
    [
      {
        value: "eslint",
        label: LINTERS.eslint,
        hint: blocked.eslint ?? "most plugins, framework rules",
        disabled: Boolean(blocked.eslint),
      },
      {
        value: "biome",
        label: LINTERS.biome,
        hint: blocked.biome ?? "one fast tool for both",
        disabled: Boolean(blocked.biome),
      },
      { value: "none", label: LINTERS.none, hint: "skip linting and formatting" },
    ],
    !blocked.eslint ? "eslint" : !blocked.biome ? "biome" : "none",
    "column",
    preset.linter,
  );

  let casing: Casing = preset.casing ?? "kebab";
  if (linter !== "none") {
    casing = await pick<Casing>(
      "File naming",
      Object.entries(CASINGS).map(([value, x]) => ({ value: value as Casing, label: x.label })),
      "kebab",
      "row",
      preset.casing,
      { detail: (v) => `e.g. components/${CASINGS[v].example}` },
    );
  }

  const hooksOk = hooksSupported(project, cwd);
  const offered = (Object.keys(EXTRAS) as Extra[]).filter((x) => {
    if (x === "docker") return dockerSupported(framework, pm);
    if (x === "hooks") return linter !== "none" && hooksOk;
    if (x === "commits") return hooksOk;
    return true;
  });
  const defaults = offered.filter((x) => x !== "docker");
  step++;
  let extras: Extra[];
  if (yes) {
    extras = defaults;
    process.stdout.write(
      `${ui.stepLine(step, "Extras", `${extras.length} of ${offered.length}`)}\n`,
    );
  } else {
    extras = await ui.multiselect({
      step,
      title: "Extras",
      choices: offered.map((value) => ({
        value,
        ...EXTRAS[value],
        ...(value === "release" && { hint: `${runScript(pm)} release` }),
      })),
      initial: defaults,
    });
  }
  if (!hooksOk) {
    process.stdout.write(
      `   ${ui.c.dim("git hooks skipped: run atc from the repository root to set them up")}\n`,
    );
  }
  return { framework, pm, linter, casing, extras: new Set(extras) };
}

const runScript = (pm: PackageManager) => (pm === "npm" ? "npm run" : pm);

const INSTALL: Record<PackageManager, string> = {
  npm: "npm install --save-dev --no-audit --no-fund",
  pnpm: "pnpm add --save-dev",
  yarn: "yarn add --dev",
  bun: "bun add --dev",
};

async function main(): Promise<void> {
  let args: ReturnType<typeof parse>;
  try {
    args = parse();
  } catch (error) {
    return ui.fail(`${(error as Error).message}\n\n Run atc --help to see the options.`);
  }
  const { values } = args;
  if (values.help) return void process.stdout.write(HELP);
  if (values.version) return void process.stdout.write(`${VERSION}\n`);

  const yes = values.yes === true;
  const cwd = realpathSync(process.cwd());
  const pkg = readPackageJson(cwd);
  if (!pkg) return ui.fail("No package.json here. Run atc inside your project folder.");
  if (!yes && !process.stdin.isTTY) {
    return ui.fail(
      "This terminal isn't interactive. Re-run with --yes to use the detected defaults.",
    );
  }

  const project = detectProject(cwd, pkg);
  ui.flightStrip(project, VERSION);
  const answers = await ask(project, cwd, yes, {
    linter: oneOf("linter", values.linter, Object.keys(LINTERS) as Linter[]),
    casing: oneOf("casing", values.casing, Object.keys(CASINGS) as Casing[]),
  });

  const read = (path: string) => {
    const full = join(cwd, path);
    return existsSync(full) ? readFileSync(full, "utf8") : undefined;
  };
  const ctx = createContext(project, answers, read);
  const plan = buildPlan(ctx, TOOLS);
  const exists = (path: string) => existsSync(join(cwd, path));

  ui.flightPlan(plan, exists, project.scripts);
  if (!yes && !(await ui.confirm("Proceed with this plan?"))) {
    process.stdout.write(`\n ${ui.c.dim("Nothing changed.")}\n\n`);
    return;
  }

  const started = performance.now();
  const usesHusky = plan.files.has(".husky/pre-commit") || plan.files.has(".husky/commit-msg");
  const warnings: string[] = [...plan.notes];
  ui.section("CHECKLIST");

  try {
    // Before touching anything: make sure the commands we'll need exist.
    const needed = [answers.pm, ...(usesHusky ? ["git"] : [])];
    await ui.task(
      `Check ${needed.join(" and ")} ${needed.length > 1 ? "are" : "is"} installed`,
      () => Promise.all(needed.map((bin) => available(bin))),
    );
    await ui.task(`Write ${plan.files.size} config files`, async () => {
      for (const path of plan.remove) rmSync(join(cwd, path), { force: true });
      for (const [path, content] of plan.files) {
        mkdirSync(dirname(join(cwd, path)), { recursive: true });
        writeFileSync(join(cwd, path), content);
      }
      const fresh = readPackageJson(cwd) ?? {};
      fresh.scripts = { ...fresh.scripts, ...plan.scripts };
      writeFileSync(join(cwd, "package.json"), json(fresh));
    });
    if (usesHusky && project.gitRoot === undefined) {
      await ui.task("Initialize git repository", () => run("git init -q", cwd));
    }
    if (plan.devDependencies.length) {
      const n = plan.devDependencies.length;
      await ui.task(`Install ${n} package${n === 1 ? "" : "s"}`, () =>
        run(`${INSTALL[answers.pm]} ${plan.devDependencies.join(" ")}`, cwd),
      );
    }
    if (usesHusky) await ui.task("Activate git hooks", () => run(`${ctx.exec} husky`, cwd));

    if (answers.linter === "eslint") {
      const fmt = await ui.task(
        "Format with Prettier",
        () => run(`${ctx.exec} prettier --write . --log-level warn`, cwd),
        true,
      );
      const lint = await ui.task(
        "Fix lint issues with ESLint",
        () => run(`${ctx.exec} eslint . --fix`, cwd),
        true,
      );
      if (fmt === "warn")
        warnings.push("Prettier couldn't format some files. Run the format script to see them.");
      if (lint === "warn")
        warnings.push("Some lint issues need a manual fix. Run the lint script to see them.");
    } else if (answers.linter === "biome") {
      const r = await ui.task(
        "Format and fix with Biome",
        () => run(`${ctx.exec} biome check --write .`, cwd),
        true,
      );
      if (r === "warn")
        warnings.push("Some Biome issues need a manual fix. Run the lint script to see them.");
    }
  } catch (error) {
    const output = error instanceof ui.TaskError ? error.output : undefined;
    return ui.fail((error as Error).message, output);
  }

  const next: [string, string][] = [["next", `git add -A && git commit -m "chore: project setup"`]];
  if (answers.extras.has("release"))
    next.push([
      "later",
      `${runScript(answers.pm)} release  ${ui.c.dim("bumps version, writes CHANGELOG, tags")}`,
    ]);
  ui.cleared(project.name, performance.now() - started, warnings, next);
}

function parse() {
  return parseArgs({
    options: {
      yes: { type: "boolean", short: "y" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
      linter: { type: "string" },
      casing: { type: "string" },
    },
    strict: true,
    allowPositionals: false,
  });
}

main().catch((error: unknown) => ui.fail(error instanceof Error ? error.message : String(error)));
