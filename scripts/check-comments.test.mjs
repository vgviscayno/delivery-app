import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { commentsIn, compare, countLines, strip } from "./check-comments.mjs";

const lines = (file, text) => countLines(commentsIn(file, text));

describe("SQL", () => {
  test("counts whole-line, trailing and block comments", () => {
    assert.equal(lines("a.sql", "-- whole\nselect 1; -- trailing\n"), 2);
    assert.equal(lines("a.sql", "select /* block */ 1;\n/* two\nlines */\n"), 3);
    assert.equal(lines("a.sql", "/* outer /* nested */ still outer */ select 1;\n"), 1);
  });

  test("counts comments inside dollar-quoted bodies", () => {
    assert.equal(
      lines(
        "a.sql",
        "create function f() returns int as $$\n  -- why\n  select 1;\n$$;\n",
      ),
      1,
    );
  });

  test("ignores comment markers inside quoted strings and identifiers", () => {
    assert.equal(lines("a.sql", "select '-- not', 'it''s /* not */', \"a--b\";\n"), 0);
  });

  test("strips a trailing comment and keeps the code", () => {
    assert.equal(
      strip("a.sql", "select 1; -- trailing\nselect 2;\n"),
      "select 1;\nselect 2;\n",
    );
  });
});

describe("shell", () => {
  test("counts whole-line and trailing comments", () => {
    assert.equal(lines("a.sh", "# whole\necho hi # trailing\n"), 2);
  });

  test("ignores # that is not a comment", () => {
    assert.equal(lines("a.sh", "echo $((1 << 2)) # trailing\n"), 1);
    assert.equal(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the input is shell, where ${#x} is parameter expansion
      lines("a.sh", 'echo "$#" ${#items[@]} \'# quoted\' "# quoted" a#b\n'),
      0,
    );
  });

  test("ignores heredoc bodies", () => {
    assert.equal(lines("a.sh", "cat <<'EOF'\n# heading\nEOF\necho done\n"), 0);
  });

  test("skips the shebang and shellcheck directives", () => {
    assert.equal(lines("a.sh", "#!/usr/bin/env bash\n# shellcheck disable=SC2034\n"), 0);
  });
});

describe("TypeScript", () => {
  test("counts line, block and trailing comments", () => {
    assert.equal(lines("a.ts", "// one\nconst a = 1; // two\n/* three\n four */\n"), 4);
  });

  test("ignores comment markers inside template literals", () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the input is TypeScript source containing a template literal
    assert.equal(lines("a.ts", "const url = `https://${host}/*`;\n"), 0);
  });

  test("skips tool directives, including the JSX form", () => {
    const tsx =
      "const a = (\n  <div>\n    {/* biome-ignore lint/a11y/x: why */}\n  </div>\n);\n";
    assert.equal(lines("a.tsx", tsx), 0);
    assert.equal(
      lines("a.ts", "// biome-ignore lint/x: why\n// @ts-expect-error why\n"),
      0,
    );
  });

  test("counts @ts-ignore and @ts-nocheck, which are not directives here", () => {
    assert.equal(lines("a.ts", "// @ts-nocheck\n// @ts-ignore\n"), 2);
  });
});

describe("compare", () => {
  test("reports files over and under their allowance", () => {
    const { grew, shrank } = compare({ a: 3, b: 1, c: 1 }, { a: 2, b: 2 });
    assert.deepEqual(
      grew.map(({ file }) => file),
      ["a", "c"],
    );
    assert.deepEqual(
      shrank.map(({ file }) => file),
      ["b"],
    );
  });
});
