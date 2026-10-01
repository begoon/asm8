import { expect, test } from "bun:test";
import { asm, AsmError, lineInfo } from "../asm8";
import { includeClosure, tabIncludeOptions } from "../docs/tab-includes";

test("tab includes assemble nested sources and preserve gutter file ownership", () => {
  const source = 'include "defs.inc"\norg 100h\ninclude "body.asm"\nhlt';
  const tabs = [
    { filename: "main.asm", source },
    { filename: "defs.inc", source: "VALUE equ 42h" },
    { filename: "body.asm", source: '.include "nested.asm"' },
    { filename: "nested.asm", source: "mvi a, VALUE" },
  ];
  const opts = tabIncludeOptions(tabs, "main.asm");
  expect(asm(source, opts)[0].data).toEqual([0x3e, 0x42, 0x76]);
  const rows = lineInfo(source, opts);
  expect(
    rows.filter((row) => row.file === "main.asm").map((row) => row.orig),
  ).toEqual([2, 4]);
  expect(rows.find((row) => row.file === "nested.asm")).toMatchObject({
    orig: 1,
    addr: 0x100,
    bytes: [0x3e, 0x42],
  });
  tabs[1].source = "VALUE equ 7";
  expect(asm(source, opts)[0].data).toEqual([0x3e, 7, 0x76]);
});

test("tab names are exact and missing or ambiguous tabs produce clear errors", () => {
  const tabs = [{ filename: "defs.inc", source: "" }];
  const opts = tabIncludeOptions(tabs, "main.asm");
  for (const name of ["DEFS.inc", "./defs.inc", "missing.inc"]) {
    expect(() => asm(`include "${name}"`, opts)).toThrow("no open tab named");
  }
  tabs.push({ filename: "defs.inc", source: "" });
  expect(() => asm('include "defs.inc"', opts)).toThrow("multiple tabs named");
});

test("self and circular includes are rejected by tab identity", () => {
  const source = 'include "other.asm"';
  const opts = tabIncludeOptions(
    [
      { filename: "main.asm", source },
      { filename: "other.asm", source: 'include "main.asm"' },
    ],
    "main.asm",
  );
  expect(() => asm(source, opts)).toThrow("main.asm -> other.asm -> main.asm");
  expect(() => asm('include "main.asm"', opts)).toThrow("main.asm -> main.asm");
});

test("both assembly and gutter errors identify the included tab and line", () => {
  const source = 'org 0\ninclude "bad.asm"';
  const opts = tabIncludeOptions(
    [{ filename: "bad.asm", source: "nop\nmvi a, UNKNOWN" }],
    "main.asm",
  );
  for (const compile of [asm, lineInfo]) {
    try {
      compile(source, opts);
      throw new Error("Expected assembly to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(AsmError);
      expect(error).toMatchObject({ file: "bad.asm", line: 2 });
    }
  }
});

test("includeClosure lists the entry tab and every reachable include once", () => {
  const tabs = [
    {
      filename: "main.asm",
      source: "include \"defs.inc\"\n .include 'body.asm'",
    },
    { filename: "defs.inc", source: "VALUE equ 1" },
    {
      filename: "body.asm",
      source: '  include "defs.inc" ; again\ninclude "main.asm"',
    },
    { filename: "unused.asm", source: "" },
    { filename: "dup.inc", source: "" },
    { filename: "dup.inc", source: "" },
  ];
  expect(includeClosure(tabs, "main.asm").map((t) => t.filename)).toEqual([
    "main.asm",
    "defs.inc",
    "body.asm",
  ]);
  expect(includeClosure(tabs, "x.asm")).toEqual([]);
  tabs[0].source = 'include "missing.inc"\ninclude "dup.inc"';
  expect(includeClosure(tabs, "main.asm").map((t) => t.filename)).toEqual([
    "main.asm",
  ]);
});
