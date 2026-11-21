import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = path.join(repoRoot, "comments-baseline.json");

const SCRIPT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const LINE_COMMENTED = { ".sql": /^\s*--/, ".sh": /^\s*#/ };
const OUT_OF_SCOPE = /^(\.agents|\.claude|\.scratch|docs)\/|\/generated\//;

const DIRECTIVES = [
  /^\/\/\s*biome-ignore\b/,
  /^\/\*\s*biome-ignore\b/,
  /^\/\/\s*@ts-expect-error\b/,
  /^\/\/\s*@vitest-environment\b/,
  /^\/\/\/\s*<reference\b/,
  /^#!/,
  /^#\s*shellcheck\b/,
];

const isDirective = (text) => DIRECTIVES.some((pattern) => pattern.test(text.trim()));

function scriptComments(file, text) {
  const kind = file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const seen = new Map();
  const collect = (ranges) => {
    for (const range of ranges ?? []) seen.set(range.pos, range);
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
  const lineOf = (pos) => source.getLineAndCharacterOfPosition(pos).line + 1;
  return [...seen.values()]
    .map((range) => ({
      pos: range.pos,
      end: range.end,
      start: lineOf(range.pos),
      endLine: lineOf(range.end),
      text: text.slice(range.pos, range.end),
    }))
    .filter((comment) => !isDirective(comment.text));
}

function lineComments(text, pattern) {
  return text
    .split("\n")
    .map((line, index) => ({ start: index + 1, endLine: index + 1, text: line }))
    .filter((line) => pattern.test(line.text) && !isDirective(line.text));
}

export function commentsIn(file, text) {
  if (SCRIPT.test(file)) return scriptComments(file, text);
  const pattern = LINE_COMMENTED[path.extname(file)];
  return pattern ? lineComments(text, pattern) : [];
}

function trackedFiles() {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    cwd: repoRoot,
    encoding: "utf8",
  })
    .split("\n")
    .filter((file) => file && !OUT_OF_SCOPE.test(file))
    .filter((file) => SCRIPT.test(file) || path.extname(file) in LINE_COMMENTED);
}

function countLines(comments) {
  const lines = new Set();
  for (const comment of comments) {
    for (let line = comment.start; line <= comment.endLine; line++) lines.add(line);
  }
  return lines.size;
}

function measure() {
  const counts = {};
  for (const file of trackedFiles()) {
    let text;
    try {
      text = readFileSync(path.join(repoRoot, file), "utf8");
    } catch {
      continue;
    }
    const lines = countLines(commentsIn(file, text));
    if (lines > 0) counts[file] = lines;
  }
  return counts;
}

function readBaseline() {
  try {
    return JSON.parse(readFileSync(BASELINE, "utf8"));
  } catch {
    return {};
  }
}

function writeBaseline(counts) {
  const sorted = Object.fromEntries(
    Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)),
  );
  writeFileSync(BASELINE, `${JSON.stringify(sorted, null, 2)}\n`);
}

function lineSpan(text, pos, end) {
  const lineStart = text.lastIndexOf("\n", pos - 1) + 1;
  const newline = text.indexOf("\n", end);
  const lineEnd = newline === -1 ? text.length : newline + 1;
  const before = text.slice(lineStart, pos);
  const after = text.slice(end, newline === -1 ? text.length : newline);
  if (before.trim() === "" && after.trim() === "") return [lineStart, lineEnd];
  const jsx = /\{\s*$/.exec(before) && /^\s*\}/.exec(after);
  if (jsx) {
    const open = text.lastIndexOf("{", pos);
    const close = text.indexOf("}", end) + 1;
    const rest = text.slice(close, newline === -1 ? text.length : newline);
    if (text.slice(lineStart, open).trim() === "" && rest.trim() === "")
      return [lineStart, lineEnd];
    return [open, close];
  }
  let from = pos;
  while (from > lineStart && /[ \t]/.test(text[from - 1])) from--;
  return [from, end];
}

export function strip(file, text) {
  const lines = text.split("\n");
  const spans = commentsIn(file, text).map((comment) => {
    if (comment.pos !== undefined) return lineSpan(text, comment.pos, comment.end);
    const lineStart =
      lines.slice(0, comment.start - 1).join("\n").length + (comment.start > 1 ? 1 : 0);
    return [lineStart, lineStart + lines[comment.start - 1].length + 1];
  });
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

function check() {
  const actual = measure();
  const baseline = readBaseline();
  const grew = [];
  const shrank = [];
  for (const file of new Set([...Object.keys(actual), ...Object.keys(baseline)])) {
    const now = actual[file] ?? 0;
    const allowed = baseline[file] ?? 0;
    if (now > allowed) grew.push(`  ${file}: ${now} comment lines, ${allowed} allowed`);
    if (now < allowed)
      shrank.push(`  ${file}: ${now} comment lines, baseline says ${allowed}`);
  }
  if (grew.length > 0) {
    console.error(
      [
        "✖ Comments added. This codebase bans comments (ADR 0014):",
        ...grew,
        "",
        "Say it in a name, a type or a test. A decision goes in docs/adr/, a hack in an issue.",
        "List them with: node scripts/check-comments.mjs --list <file>",
      ].join("\n"),
    );
    process.exit(1);
  }
  if (shrank.length > 0) {
    console.error(
      [
        "✖ Comments removed but the baseline still allows them. Lock the ratchet in:",
        ...shrank,
        "",
        "Run: pnpm comments:update",
      ].join("\n"),
    );
    process.exit(1);
  }
  const total = Object.values(actual).reduce((sum, lines) => sum + lines, 0);
  console.log(
    `✔ No new comments. ${total} lines left across ${Object.keys(actual).length} files.`,
  );
}

function main([mode, ...files]) {
  if (mode === "--update") writeBaseline(measure());
  else if (mode === "--strip") stripFiles(files);
  else if (mode === "--list") list(files.length > 0 ? files : trackedFiles());
  else if (mode === "--json") console.log(JSON.stringify(measure(), null, 2));
  else check();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
