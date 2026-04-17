import { describe, expect, test } from "bun:test";
import { asm, AsmError, listing } from "../asm8";

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
});
