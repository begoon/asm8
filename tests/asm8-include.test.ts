import { describe, expect, test } from "bun:test";
import { asm, AsmError, type AsmOptions, type IncludeResult } from "../asm8";

// In-memory include reader: keys are normalized resolved paths.
function makeFs(files: Record<string, string>): AsmOptions {
  const readInclude = (path: string, fromFile?: string): IncludeResult => {
    // simple resolution: if path is in the table use as-is; else join with
    // dirname(fromFile).
    let resolvedFile = path;
    if (!(path in files) && fromFile) {
      const dir = fromFile.replace(/\/[^/]*$/, "");
      const candidate = `${dir}/${path}`;
      if (candidate in files) resolvedFile = candidate;
    }
    const src = files[resolvedFile];
    if (src === undefined) {
      throw new Error(`ENOENT: ${path}`);
    }
    return { source: src, resolvedFile };
  };
  return { file: "/root/main.asm", readInclude };
}

function bytes(source: string, opts?: AsmOptions): number[] {
  const s = asm(source, opts);
  expect(s).toHaveLength(1);
  return s[0].data;
}

describe("include directive", () => {
  test("include injects file contents in place", () => {
    const opts = makeFs({
      "/root/inc.asm": "mvi b, 2\n",
    });
    const main = `org 0\nmvi a, 1\ninclude "inc.asm"\nhlt\nend\n`;
    expect(bytes(main, opts)).toEqual([0x3e, 0x01, 0x06, 0x02, 0x76]);
  });

  test(".include works the same as include", () => {
    const opts = makeFs({
      "/root/inc.asm": "mvi b, 2\n",
    });
    const main = `org 0\nmvi a, 1\n.include "inc.asm"\nhlt\nend\n`;
    expect(bytes(main, opts)).toEqual([0x3e, 0x01, 0x06, 0x02, 0x76]);
  });

  test("included file can define labels used by the includer", () => {
    const opts = makeFs({
      "/root/defs.asm": "FOO equ 42h\n",
    });
    const main = `include "defs.asm"\norg 0\nmvi a, FOO\nhlt\nend\n`;
    expect(bytes(main, opts)).toEqual([0x3e, 0x42, 0x76]);
  });

  test("includer can define labels used by the included file", () => {
    const opts = makeFs({
      "/root/use.asm": "mvi a, BAR\n",
    });
    const main = `BAR equ 55h\norg 0\ninclude "use.asm"\nhlt\nend\n`;
    expect(bytes(main, opts)).toEqual([0x3e, 0x55, 0x76]);
  });

  test("single-quoted include path works", () => {
    const opts = makeFs({
      "/root/inc.asm": "nop\n",
    });
    const main = `org 0\ninclude 'inc.asm'\nhlt\nend\n`;
    expect(bytes(main, opts)).toEqual([0x00, 0x76]);
  });

  test("nested includes work and resolve relative to including file", () => {
    const opts = makeFs({
      "/root/a.asm": `mvi a, 1\ninclude "b.asm"\n`,
      "/root/b.asm": `mvi b, 2\n`,
    });
    const main = `org 0\ninclude "a.asm"\nhlt\nend\n`;
    expect(bytes(main, opts)).toEqual([0x3e, 0x01, 0x06, 0x02, 0x76]);
  });

  test("circular include is rejected", () => {
    const opts = makeFs({
      "/root/a.asm": `include "b.asm"\n`,
      "/root/b.asm": `include "a.asm"\n`,
    });
    const main = `org 0\ninclude "a.asm"\nhlt\nend\n`;
    let caught: unknown;
    try {
      asm(main, opts);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AsmError);
    expect((caught as AsmError).message).toMatch(/circular include/);
  });

  test("self-include is rejected", () => {
    const opts = makeFs({
      "/root/a.asm": `include "a.asm"\n`,
    });
    const main = `org 0\ninclude "a.asm"\nhlt\nend\n`;
    let caught: unknown;
    try {
      asm(main, opts);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AsmError);
    expect((caught as AsmError).message).toMatch(/circular include/);
  });

  test("missing file surfaces a clear AsmError", () => {
    const opts = makeFs({});
    let caught: unknown;
    try {
      asm(`org 0\ninclude "nope.asm"\nhlt\nend\n`, opts);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AsmError);
    expect((caught as AsmError).message).toMatch(/cannot read include/);
  });

  test("unquoted argument is rejected", () => {
    const opts = makeFs({ "/root/inc.asm": "nop\n" });
    let caught: unknown;
    try {
      asm(`org 0\ninclude inc.asm\nhlt\nend\n`, opts);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AsmError);
    expect((caught as AsmError).message).toMatch(/quoted filename/);
  });

  test("include without a reader throws", () => {
    let caught: unknown;
    try {
      asm(`org 0\ninclude "x.asm"\nhlt\nend\n`);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AsmError);
    expect((caught as AsmError).message).toMatch(/include is not supported/);
  });

  test("error inside included file reports that file's path and line", () => {
    const opts = makeFs({
      "/root/bad.asm": "nop\nmvi a, NOPE\n",
    });
    let caught: unknown;
    try {
      asm(`org 0\ninclude "bad.asm"\nhlt\nend\n`, opts);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AsmError);
    const err = caught as AsmError;
    expect(err.file).toBe("/root/bad.asm");
    expect(err.line).toBe(2);
  });

  test("end inside included file terminates the whole assembly", () => {
    const opts = makeFs({
      "/root/inc.asm": "mvi b, 2\nend\n",
    });
    // After include emits MVI B,2 and END, the trailing MVI A,9 in main
    // should be skipped.
    const main = `org 0\nmvi a, 1\ninclude "inc.asm"\nmvi a, 9\n`;
    expect(bytes(main, opts)).toEqual([0x3e, 0x01, 0x06, 0x02]);
  });
});
