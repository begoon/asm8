import { describe, expect, test } from "bun:test";
import { asm, AsmError, listing, sectionMap, symbolTable } from "../asm8";

function catchAsm(source: string): AsmError {
  try {
    asm(source);
  } catch (e) {
    if (e instanceof AsmError) return e;
    throw e;
  }
  throw new Error("expected AsmError");
}

describe("AsmError reporting", () => {
  test("unknown mnemonic reports line, source, column", () => {
    const src = ["    org 0100h", "    blarg a, b", "    hlt"].join("\n");
    const e = catchAsm(src);
    expect(e).toBeInstanceOf(AsmError);
    expect(e.message).toBe("unknown mnemonic: BLARG");
    expect(e.line).toBe(2);
    expect(e.source).toBe("    blarg a, b");
    expect(e.column).toBe(5);
  });

  test("unknown symbol in expression", () => {
    const src = ["  org 0", "  mvi a, MISSING", "  hlt"].join("\n");
    const e = catchAsm(src);
    expect(e.message).toBe("unknown symbol: MISSING");
    expect(e.line).toBe(2);
    expect(e.column).toBe(3);
  });

  test("unexpected character in expression", () => {
    const src = ["org 0", "mvi a, @#$", "hlt"].join("\n");
    const e = catchAsm(src);
    expect(e.message).toBe("unexpected character in expression: '@'");
    expect(e.line).toBe(2);
    expect(e.column).toBe(1);
  });

  test("SECTION before ORG", () => {
    const src = ["section foo", "org 0", "hlt"].join("\n");
    const e = catchAsm(src);
    expect(e.message).toBe("SECTION before ORG");
    expect(e.line).toBe(1);
  });

  test("duplicate section name", () => {
    const src = [
      "org 0",
      "section foo",
      "hlt",
      "org 100h",
      "section foo",
      "hlt",
    ].join("\n");
    const e = catchAsm(src);
    expect(e.message).toBe("duplicate section name: foo");
    expect(e.line).toBe(5);
  });

  test("code before ORG", () => {
    const src = ["hlt"].join("\n");
    const e = catchAsm(src);
    expect(e.message).toBe("code before ORG");
    expect(e.line).toBe(1);
  });

  test("column points to first non-space character", () => {
    const src = ["org 0", "\t\t  bogus", "hlt"].join("\n");
    const e = catchAsm(src);
    expect(e.line).toBe(2);
    expect(e.column).toBe(5);
  });

  test("listing() also wraps errors as AsmError", () => {
    const src = ["org 0", "mvi a, MISSING", "hlt"].join("\n");
    let caught: unknown;
    try {
      listing(src);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AsmError);
    expect((caught as AsmError).line).toBe(2);
    expect((caught as AsmError).message).toBe("unknown symbol: MISSING");
  });

  test("valid source does not throw", () => {
    const src = ["org 0", "  hlt", "  end"].join("\n");
    expect(() => asm(src)).not.toThrow();
  });

  test("symbolTable() wraps errors as AsmError", () => {
    const src = ["org 0", "FOO equ BAR", "hlt"].join("\n");
    let caught: unknown;
    try {
      symbolTable(src);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AsmError);
    expect((caught as AsmError).line).toBe(2);
    expect((caught as AsmError).message).toBe("unknown symbol: BAR");
  });

  test("listing() no longer contains Symbol Table section", () => {
    const src = ["org 0", "FOO equ 42", "start: hlt"].join("\n");
    const out = listing(src);
    expect(out).not.toContain("Symbol Table");
    expect(out).not.toMatch(/^FOO\s+002A$/m);
    expect(out).not.toMatch(/^START\s+0000$/m);
  });

  test("sectionMap() lists sections sorted with totals", () => {
    const src = [
      "org 0200h",
      "section data",
      'db "hello"',
      "org 0100h",
      "section code",
      "hlt",
      "end",
    ].join("\n");
    const sections = asm(src);
    const out = sectionMap(sections);
    const lines = out.split("\n");
    expect(lines[0]).toBe("0100-0100      1 bytes  code");
    expect(lines[1]).toBe("0200-0204      5 bytes  data");
    expect(lines[2]).toBe("");
    expect(lines[3]).toBe("Total: 6 bytes in 2 sections");
  });

  test("sectionMap() omits name for unnamed sections and uses singular", () => {
    const src = ["org 0100h", "db 1,2,3", "end"].join("\n");
    const out = sectionMap(asm(src));
    expect(out).toBe(
      ["0100-0102      3 bytes", "", "Total: 3 bytes in 1 section"].join("\n"),
    );
  });

  test("symbolTable() lists symbols sorted with hex4 values", () => {
    const src = ["org 0100h", "ZED equ 42", "start: hlt", "alpha: hlt"].join(
      "\n",
    );
    const out = symbolTable(src);
    const lines = out.split("\n");
    expect(lines).toEqual([
      "ALPHA                    0101",
      "START                    0100",
      "ZED                      002A",
    ]);
  });
});
