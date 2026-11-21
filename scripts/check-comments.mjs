import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE_FILE = "comments-baseline.json";
const BASELINE = path.join(repoRoot, BASELINE_FILE);

const SCRIPT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const OUT_OF_SCOPE = /^(\.agents|\.claude|docs)\/|\/generated\//;

const DIRECTIVES = [
  /^\/\/\s*biome-ignore\b/,
  /^\/\*\s*biome-ignore\b/,
  /^\/\/\s*@ts-expect-error\b/,
  /^\/\/\s*@vitest-environment\b/,
  /^#!/,
  /^#\s*shellcheck\b/,
];

const isDirective = (text) => DIRECTIVES.some((pattern) => pattern.test(text.trim()));

const endOfLine = (text, from) => {
  const newline = text.indexOf("\n", from);
  return newline === -1 ? text.length : newline;
};

function scriptComments(file, text) {
  const kind = file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const spans = new Map();
  const collect = (ranges) => {
    for (const range of ranges ?? []) spans.set(range.pos, [range.pos, range.end]);
  };
  const visit = (node) => {
    const children = node.getChildren(source);
    if (children.length > 0) {
      for (const child of children) visit(child);
      return;
    }
    if (node.kind === ts.SyntaxKind.JsxText) return;
    collect(ts.getLeadingCommentRanges(text, node.pos));
    collect(ts.getTrailingCommentRanges(text, node.end));
  };
  visit(source);
  return [...spans.values()];
}

function skipQuoted(text, from, quote) {
  let at = from + 1;
  while (at < text.length) {
    if (text[at] === quote && text[at + 1] !== quote) return at + 1;
    at += text[at] === quote ? 2 : 1;
  }
  return at;
}

function blockCommentEnd(text, from) {
  let depth = 0;
  let at = from;
  do {
    const marker = text.slice(at, at + 2);
    depth += marker === "/*" ? 1 : marker === "*/" ? -1 : 0;
    at += marker === "/*" || marker === "*/" ? 2 : 1;
  } while (depth > 0 && at < text.length);
  return at;
}

function doubleQuotedEnd(text, from) {
  let at = from + 1;
  while (at < text.length && text[at] !== '"') at += text[at] === "\\" ? 2 : 1;
  return at + 1;
}

function heredocBodyEnd(text, from, heredocs) {
  let at = from;
  while (heredocs.length > 0 && at < text.length) {
    const end = endOfLine(text, at);
    if (text.slice(at, end).trim() === heredocs[0]) heredocs.shift();
    at = end + 1;
  }
  return at;
}

const SQL_STEPS = [
  (text, at) => text.startsWith("--", at) && { next: endOfLine(text, at), comment: true },
  (text, at) =>
    text.startsWith("/*", at) && { next: blockCommentEnd(text, at), comment: true },
  (text, at) => /['"]/.test(text[at]) && { next: skipQuoted(text, at, text[at]) },
];

const SHELL_STEPS = [
  (text, at, state) =>
    text[at] === "\n" &&
    state.heredocs.length > 0 && { next: heredocBodyEnd(text, at + 1, state.heredocs) },
  (text, at) => text[at] === "\\" && { next: at + 2 },
  (text, at) =>
    text[at] === "'" && { next: text.indexOf("'", at + 1) + 1 || text.length },
  (text, at) => text[at] === '"' && { next: doubleQuotedEnd(text, at) },
  (text, at) =>
    text[at] === "#" &&
    (at === 0 || /[\s;&|()]/.test(text[at - 1])) && {
      next: endOfLine(text, at),
      comment: true,
    },
  (text, at, state) => {
    const heredoc = /^<<-?\s*(['"]?)([A-Za-z_]\w*)\1/.exec(text.slice(at, at + 64));
    if (!heredoc) return false;
    state.heredocs.push(heredoc[2]);
    return { next: at + heredoc[0].length };
  },
];

function scan(text, steps) {
  const spans = [];
  const state = { heredocs: [] };
  let at = 0;
  while (at < text.length) {
    const step = steps.reduce(
      (found, attempt) => found || attempt(text, at, state),
      false,
    );
    if (step?.comment) spans.push([at, step.next]);
    at = step ? step.next : at + 1;
  }
  return spans;
}

const PARSERS = {
  ".sql": (_, text) => scan(text, SQL_STEPS),
  ".sh": (_, text) => scan(text, SHELL_STEPS),
};

export function commentsIn(file, text) {
  const parse = SCRIPT.test(file) ? scriptComments : PARSERS[path.extname(file)];
  if (!parse) return [];
  const lineStarts = [0];
  for (let at = text.indexOf("\n"); at !== -1; at = text.indexOf("\n", at + 1)) {
    lineStarts.push(at + 1);
  }
  const lineOf = (pos) => {
    let line = 0;
    while (line + 1 < lineStarts.length && lineStarts[line + 1] <= pos) line++;
    return line + 1;
  };
  return parse(file, text)
    .map(([pos, end]) => ({
      pos,
      end,
      start: lineOf(pos),
      endLine: lineOf(end),
      text: text.slice(pos, end),
    }))
    .filter((comment) => !isDirective(comment.text));
}

function trackedFiles() {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    cwd: repoRoot,
    encoding: "utf8",
  })
    .split("\n")
    .filter((file) => file && !OUT_OF_SCOPE.test(file))
    .filter((file) => SCRIPT.test(file) || path.extname(file) in PARSERS);
}

export function countLines(comments) {
  const lines = new Set();
  for (const comment of comments) {
    for (let line = comment.start; line <= comment.endLine; line++) lines.add(line);
  }
  return lines.size;
}

function measure() {
  const counts = {};
  for (const file of trackedFiles()) {
    const full = path.join(repoRoot, file);
    if (!existsSync(full)) continue;
    const lines = countLines(commentsIn(file, readFileSync(full, "utf8")));
    if (lines > 0) counts[file] = lines;
  }
  return counts;
}

function parseBaseline(json, source) {
  try {
    return JSON.parse(json);
  } catch (error) {
    fail([`✖ ${source} is not valid JSON: ${error.message}`]);
  }
}

function readBaseline() {
  if (!existsSync(BASELINE)) return {};
  return parseBaseline(readFileSync(BASELINE, "utf8"), BASELINE_FILE);
}

function baselineAt(ref) {
  try {
    execFileSync("git", ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], {
      cwd: repoRoot,
      stdio: "ignore",
    });
  } catch {
    fail([`✖ Can't compare the baseline with ${ref}: no such commit.`]);
  }
  try {
    const json = execFileSync("git", ["show", `${ref}:${BASELINE_FILE}`], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return parseBaseline(json, `${BASELINE_FILE} at ${ref}`);
  } catch {
    return null;
  }
}

function writeBaseline(counts) {
  const sorted = Object.fromEntries(
    Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)),
  );
  writeFileSync(BASELINE, `${JSON.stringify(sorted, null, 2)}\n`);
}

export function compare(now, allowed) {
  const grew = [];
  const shrank = [];
  for (const file of new Set([...Object.keys(now), ...Object.keys(allowed)])) {
    const lines = now[file] ?? 0;
    const limit = allowed[file] ?? 0;
    if (lines > limit) grew.push({ file, lines, limit });
    if (lines < limit) shrank.push({ file, lines, limit });
  }
  return { grew, shrank };
}

function fail(lines) {
  console.error(lines.join("\n"));
  process.exit(1);
}

function failOnGrowth(grew, against) {
  if (grew.length === 0) return;
  fail([
    "✖ Comments added. This codebase bans comments (ADR 0014):",
    ...grew.map(
      ({ file, lines, limit }) =>
        `  ${file}: ${lines} comment lines, ${limit} ${against}`,
    ),
    "",
    "Say it in a name, a type or a test. A decision goes in docs/adr/, a hack in an issue.",
    "List them with: node scripts/check-comments.mjs --list <file>",
  ]);
}

function lineSpan(text, pos, end) {
  const lineStart = text.lastIndexOf("\n", pos - 1) + 1;
  const lineEnd = endOfLine(text, end);
  const wholeLine = [lineStart, Math.min(lineEnd + 1, text.length)];
  const before = text.slice(lineStart, pos);
  const after = text.slice(end, lineEnd);
  if (before.trim() === "" && after.trim() === "") return wholeLine;
  if (/\{\s*$/.test(before) && /^\s*\}/.test(after)) {
    const open = text.lastIndexOf("{", pos);
    const close = text.indexOf("}", end) + 1;
    const rest = text.slice(close, lineEnd);
    if (text.slice(lineStart, open).trim() === "" && rest.trim() === "") return wholeLine;
    return [open, close];
  }
  let from = pos;
  while (from > lineStart && /[ \t]/.test(text[from - 1])) from--;
  return [from, end];
}

export function strip(file, text) {
  const spans = commentsIn(file, text).map(({ pos, end }) => lineSpan(text, pos, end));
  let out = text;
  for (const [from, to] of spans.sort((a, b) => b[0] - a[0])) {
    out = out.slice(0, from) + out.slice(to);
  }
  return out;
}

function stripFiles(files) {
  for (const file of files) {
    const full = path.join(repoRoot, file);
    const text = readFileSync(full, "utf8");
    const stripped = strip(file, text);
    if (stripped !== text) writeFileSync(full, stripped);
  }
}

function list(files) {
  for (const file of files) {
    const text = readFileSync(path.join(repoRoot, file), "utf8");
    for (const comment of commentsIn(file, text)) {
      console.log(`${file}:${comment.start}\n${comment.text}\n`);
    }
  }
}

function update() {
  const actual = measure();
  failOnGrowth(
    compare(actual, readBaseline()).grew,
    "allowed; the baseline only shrinks",
  );
  writeBaseline(actual);
}

function check(baseRef) {
  const actual = measure();
  const baseline = readBaseline();
  if (baseRef) {
    const base = baselineAt(baseRef);
    if (base) failOnGrowth(compare(baseline, base).grew, `allowed at ${baseRef}`);
  }
  const { grew, shrank } = compare(actual, baseline);
  failOnGrowth(grew, "allowed");
  if (shrank.length > 0) {
    fail([
      "✖ Comments removed but the baseline still allows them. Lock the ratchet in:",
      ...shrank.map(
        ({ file, lines, limit }) =>
          `  ${file}: ${lines} comment lines, baseline says ${limit}`,
      ),
      "",
      "Run: pnpm comments:update",
    ]);
  }
  const total = Object.values(actual).reduce((sum, lines) => sum + lines, 0);
  console.log(
    `✔ No new comments. ${total} lines left across ${Object.keys(actual).length} files.`,
  );
}

function main([mode, ...args]) {
  if (mode === "--update") update();
  else if (mode === "--strip") stripFiles(args);
  else if (mode === "--list") list(args.length > 0 ? args : trackedFiles());
  else if (mode === "--against") check(args[0]);
  else check();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
