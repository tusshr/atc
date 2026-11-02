import { ConfirmPrompt, isCancel, MultiSelectPrompt, SelectPrompt } from "@clack/core";

import type { Plan, Project } from "./plan.ts";

// ── color ────────────────────────────────────────────────────────────────────

const out = process.stdout;
const useColor = Boolean(out.isTTY) && !process.env.NO_COLOR && process.env.TERM !== "dumb";
const sgr = (code: string) => (s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);

export const c = {
  amber: sgr("38;5;214"),
  amberBold: sgr("1;38;5;214"),
  bold: sgr("1;38;5;255"),
  white: sgr("38;5;255"),
  dim: sgr("38;5;242"),
  faint: sgr("38;5;238"),
  green: sgr("38;5;114"),
  red: sgr("38;5;203"),
  tag: sgr("1;38;5;233;48;5;214"),
  okTag: sgr("1;38;5;233;48;5;114"),
  errTag: sgr("1;38;5;233;48;5;203"),
  chip: sgr("38;5;246;48;5;235"),
};

/** A highlighted label; falls back to [brackets] when colors are off. */
const tag = (s: string, on = true) =>
  useColor ? (on ? c.tag : c.chip)(` ${s} `) : on ? `[${s}]` : ` ${s} `;
const width = () => out.columns ?? 80;
const write = (s = "") => out.write(`${s}\n`);
const pad2 = (n: number) => String(n).padStart(2, "0");

// ── layout pieces ────────────────────────────────────────────────────────────

const LEADER_WIDTH = 30;
const leader = (label: string, value: string, w = LEADER_WIDTH) =>
  `${c.white(label)} ${c.faint("·".repeat(Math.max(2, w - label.length)))} ${value}`;

export const stepLine = (n: number, label: string, value: string) =>
  ` ${c.dim(pad2(n))}  ${leader(label, c.amber(value))}`;

/** The header: a flight strip with what we detected. */
export function flightStrip(p: Project, version: string): void {
  const lang = p.typescript ? `TS${p.tsMajor ? ` ${p.tsMajor}` : ""}` : "JS";
  const fw =
    p.framework === "node"
      ? "NODE"
      : `${p.framework.toUpperCase()}${p.frameworkMajor ? ` ${p.frameworkMajor}` : ""}`;
  const name = p.name.length > 24 ? `${p.name.slice(0, 23)}…` : p.name;
  const cells: [string, string, (s: string) => string][] = [
    ["ATC", `v${version}`, c.amberBold],
    [name.toUpperCase(), "project", c.bold],
    [fw, "framework", c.white],
    [p.pm.toUpperCase(), "pm", c.white],
    [lang, "lang", c.white],
  ];
  const widths = cells.map(([a, b]) => Math.max(a.length, b.length) + 2);
  const rule = (l: string, m: string, r: string) =>
    c.faint(` ${l}${widths.map((w) => "─".repeat(w)).join(m)}${r}`);
  const row = (
    pick: (cell: (typeof cells)[number]) => string,
    color: (cell: (typeof cells)[number]) => (s: string) => string,
  ) =>
    ` ${c.faint("│")}${cells.map((cell, i) => color(cell)(` ${pick(cell).padEnd((widths[i] ?? 0) - 1)}`)).join(c.faint("│"))}${c.faint("│")}`;
  write();
  write(rule("┌", "┬", "┐"));
  write(
    row(
      (x) => x[0],
      (x) => x[2],
    ),
  );
  write(
    row(
      (x) => x[1],
      () => c.dim,
    ),
  );
  write(rule("└", "┴", "┘"));
  write();
}

// ── prompts ──────────────────────────────────────────────────────────────────

export interface Choice<T extends string> {
  value: T;
  label: string;
  hint?: string;
  disabled?: boolean;
}

function aborted(): never {
  write();
  write(` ${useColor ? c.errTag(" ABORTED ") : "ABORTED"}  ${c.dim("No changes were made.")}`);
  process.exit(130);
}

const header = (n: number, title: string, keys: string) =>
  ` ${c.amberBold(pad2(n))}  ${c.bold(title)}   ${c.dim(keys)}`;

export async function select<T extends string>(o: {
  step: number;
  title: string;
  choices: Choice<T>[];
  initial: T;
  layout: "row" | "column";
  /** Extra line under a row layout, e.g. a filename example. */
  detail?: (value: T) => string;
  display?: (value: T) => string;
}): Promise<T> {
  const show = (v: T) => o.display?.(v) ?? o.choices.find((x) => x.value === v)?.label ?? v;
  const prompt = new SelectPrompt<Choice<T>>({
    options: o.choices,
    initialValue: o.initial,
    render() {
      const current = this.options[this.cursor];
      if (this.state === "submit" && current) return stepLine(o.step, o.title, show(current.value));
      if (this.state === "cancel") return stepLine(o.step, o.title, c.dim("cancelled"));
      const lines = [
        header(
          o.step,
          o.title,
          o.layout === "row" ? "← → move · enter select" : "↑ ↓ move · enter select",
        ),
        "",
      ];
      if (o.layout === "row") {
        lines.push(
          `     ${this.options.map((x, i) => (x.disabled ? c.faint(` ${x.label} `) : tag(x.label, i === this.cursor))).join(" ")}`,
        );
        const extra = current && (o.detail?.(current.value) ?? current.hint);
        if (extra) lines.push(`     ${c.dim(extra)}`);
      } else {
        const w = Math.max(...this.options.map((x) => x.label.length)) + 3;
        for (const [i, x] of this.options.entries()) {
          const active = i === this.cursor;
          const label = x.label.padEnd(w);
          lines.push(
            `   ${active ? c.amberBold("›") : " "} ${x.disabled ? c.faint(label) : active ? c.amberBold(label) : c.white(label)}${c.dim(x.hint ?? "")}`,
          );
        }
      }
      return `${lines.join("\n")}\n`;
    },
  });
  const value = await prompt.prompt();
  if (isCancel(value) || value === undefined) aborted();
  return value as T;
}

export async function multiselect<T extends string>(o: {
  step: number;
  title: string;
  choices: Choice<T>[];
  initial: T[];
}): Promise<T[]> {
  const summary = (v: readonly T[]) => (v.length ? `${v.length} of ${o.choices.length}` : "none");
  const prompt = new MultiSelectPrompt<Choice<T>>({
    options: o.choices,
    initialValues: o.initial,
    required: false,
    render() {
      const value = (this.value ?? []) as T[];
      if (this.state === "submit") return stepLine(o.step, o.title, summary(value));
      if (this.state === "cancel") return stepLine(o.step, o.title, c.dim("cancelled"));
      const w = Math.max(...this.options.map((x) => x.label.length)) + 3;
      const lines = [header(o.step, o.title, "↑ ↓ move · space toggle · enter confirm"), ""];
      for (const [i, x] of this.options.entries()) {
        const active = i === this.cursor;
        const on = value.includes(x.value);
        lines.push(
          `   ${active ? c.amberBold("›") : " "} ${on ? c.amber("[x]") : c.dim("[ ]")} ${active ? c.bold(x.label.padEnd(w)) : c.white(x.label.padEnd(w))}${c.dim(x.hint ?? "")}`,
        );
      }
      return `${lines.join("\n")}\n`;
    },
  });
  const value = await prompt.prompt();
  if (isCancel(value) || value === undefined) aborted();
  return value as T[];
}

export async function confirm(message: string): Promise<boolean> {
  const prompt = new ConfirmPrompt({
    active: "Yes",
    inactive: "No",
    initialValue: true,
    render() {
      const q = ` ${c.amberBold("?")}  ${c.bold(message)}`;
      if (this.state === "submit") return `${q}  ${c.amber(this.value ? "Yes" : "No")}`;
      if (this.state === "cancel") return `${q}  ${c.dim("cancelled")}`;
      return `${q}  ${tag("Yes", this.value === true)} ${tag("No", this.value === false)}  ${c.dim("← → · enter")}\n`;
    },
  });
  const value = await prompt.prompt();
  if (isCancel(value)) aborted();
  return value === true;
}

// ── flight plan ──────────────────────────────────────────────────────────────

/** Join items with a separator, wrapping into lines no wider than `max`. */
export function wrap(items: string[], max: number, sep = " · "): string[] {
  const lines: string[] = [];
  let line = "";
  for (const item of items) {
    const next = line ? `${line}${sep}${item}` : item;
    if (line && next.length > max) {
      lines.push(line);
      line = item;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

export function flightPlan(
  plan: Plan,
  exists: (path: string) => boolean,
  existingScripts: Readonly<Record<string, string>>,
): void {
  const files = [
    ...[...plan.files.keys()].map((f) => [exists(f) ? "~" : "+", f] as const),
    ...plan.remove.map((f) => ["-", f] as const),
  ];
  const scripts = Object.keys(plan.scripts).map((name) =>
    existingScripts[name] === undefined ? name : `${name} (extended)`,
  );
  const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  write();
  write(
    ` ${tag("FLIGHT PLAN")}  ${c.dim([count(files.length, "file"), count(plan.devDependencies.length, "package"), count(scripts.length, "script")].join(" · "))}`,
  );
  write();

  const gutter = 13;
  const label = (s: string) => `   ${c.dim(s.padEnd(gutter - 3))}`;
  const blank = " ".repeat(gutter);
  const room = Math.max(30, Math.min(width(), 100) - gutter - 2);

  const MARKS = { "+": c.green("+"), "~": c.amber("~"), "-": c.red("-") };
  const col = Math.max(...files.map(([, f]) => f.length), 0) + 4;
  const perRow = col * 2 <= room ? 2 : 1;
  for (let i = 0; i < files.length; i += perRow) {
    const row = files
      .slice(i, i + perRow)
      .map(([m, f]) => `${MARKS[m]} ${f.padEnd(col - 2)}`)
      .join("");
    write(`${i === 0 ? label("files") : blank}${row.trimEnd()}`);
  }
  for (const [name, items] of [
    ["packages", plan.devDependencies],
    ["scripts", scripts],
  ] as const) {
    if (!items.length) continue;
    for (const [i, line] of wrap([...items], room).entries()) {
      write(`${i === 0 ? label(name) : blank}${line}`);
    }
  }
  for (const [i, note] of plan.notes.entries()) {
    write(`${i === 0 ? label("notes") : blank}${c.amber("!")} ${note}`);
  }
  write();
  const legend = [
    `${MARKS["+"]} ${c.dim("new")}`,
    `${MARKS["~"]} ${c.dim("replaces an existing file")}`,
    ...(plan.remove.length
      ? [`${MARKS["-"]} ${c.dim("removed: it would override the new config")}`]
      : []),
  ];
  write(`${blank}${legend.join("   ")}`);
  write();
}

// ── checklist ────────────────────────────────────────────────────────────────

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const CHECK_WIDTH = 34;
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

export type TaskResult = "ok" | "warn";

/** Errors carrying command output, shown when a task fails. */
export class TaskError extends Error {
  readonly output: string;
  constructor(message: string, output: string) {
    super(message);
    this.output = output;
  }
}

/**
 * Run one checklist step with a spinner. `soft` steps that fail are shown as a
 * warning instead of stopping the run (e.g. lint errors left to fix by hand).
 */
export async function task(
  label: string,
  fn: () => Promise<unknown>,
  soft = false,
): Promise<TaskResult> {
  const start = performance.now();
  const live = Boolean(out.isTTY);
  let frame = 0;
  const draw = () =>
    out.write(`\r\x1b[2K   ${c.amber(FRAMES[frame++ % FRAMES.length] ?? "")} ${c.white(label)}`);
  const timer = live ? setInterval(draw, 80) : undefined;
  // Ctrl+C while a step runs: restore the cursor before exiting (the child gets SIGINT too).
  const interrupted = () => {
    if (timer) clearInterval(timer);
    out.write("\r\x1b[2K\x1b[?25h");
    write(`   ${c.red("✗")} ${c.white(label)} ${c.dim("interrupted")}`);
    process.exit(130);
  };
  process.once("SIGINT", interrupted);
  if (live) {
    out.write("\x1b[?25l");
    draw();
  }
  const finish = (icon: string, status: string) => {
    process.off("SIGINT", interrupted);
    if (timer) clearInterval(timer);
    if (live) out.write("\r\x1b[2K\x1b[?25h");
    write(`   ${icon} ${leader(label, c.dim(status.padStart(6)), CHECK_WIDTH)}`);
  };
  try {
    await fn();
    finish(c.green("✓"), seconds(performance.now() - start));
    return "ok";
  } catch (error) {
    if (soft) {
      finish(c.amber("!"), "issues");
      return "warn";
    }
    finish(c.red("✗"), "failed");
    throw error;
  }
}

export const section = (title: string) => {
  write();
  write(` ${c.dim(title)}`);
};

export function cleared(name: string, ms: number, notes: string[], next: [string, string][]): void {
  write();
  write(
    ` ${useColor ? c.okTag(" CLEARED ") : "CLEARED"}  ${c.white(`${name} is set up`)} ${c.dim(`· ${seconds(ms)}`)}`,
  );
  write();
  for (const note of notes) write(`   ${c.amber("!")} ${note}`);
  if (notes.length) write();
  for (const [k, v] of next) write(`   ${c.dim(k.padEnd(6))}${v}`);
  write();
}

export function fail(message: string, output?: string): never {
  out.write("\x1b[?25h");
  process.stderr.write(`\n ${useColor ? c.errTag(" ERROR ") : "ERROR"}  ${message}\n`);
  if (output?.trim()) {
    const tail = output.trim().split("\n").slice(-30);
    process.stderr.write(`\n${tail.map((l) => `   ${c.dim("│")} ${l}`).join("\n")}\n`);
  }
  process.stderr.write("\n");
  process.exit(1);
}
