import { describe, expect, test } from "bun:test";
import { asm, AsmError } from "../asm8";

function expectDup(source: string, expectedLine: number) {
  let caught: unknown;
  try {
    asm(source);
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(AsmError);
  const err = caught as AsmError;
  expect(err.message).toMatch(/duplicate symbol/);
  expect(err.line).toBe(expectedLine);
}

describe("duplicate symbol detection", () => {
  test("two labels with the same name fail", () => {
    expectDup(`org 0\nfoo: nop\nfoo: hlt\nend\n`, 3);
  });

  test("two equs with the same name fail", () => {
    expectDup(`FOO equ 1\nFOO equ 2\norg 0\nend\n`, 2);
  });

  test("label then equ for the same name fails", () => {
    expectDup(`org 0\nfoo: nop\nfoo equ 5\nend\n`, 3);
  });

  test("equ then label for the same name fails", () => {
    expectDup(`FOO equ 5\norg 0\nfoo: nop\nend\n`, 3);
  });

  test("case-insensitive: FOO collides with foo", () => {
    expectDup(`org 0\nfoo: nop\nFOO: hlt\nend\n`, 3);
  });

  test("forward-referenced equ then redefinition fails", () => {
    // Line 1's `A equ B` cannot resolve yet (B unknown), so it sits in the
    // pending queue. The duplicate `A equ 2` on line 2 must still be caught.
    expectDup(`A equ B\nA equ 2\nB equ 5\norg 0\nend\n`, 2);
  });

  test("duplicate local label under the same scope fails", () => {
    // Local labels are stored as `<lastLabel><name>`, so two `@loop`s under
    // the same `foo` collide as `foo@loop`.
    expectDup(`org 0\nfoo: nop\n@loop: nop\n@loop: hlt\nend\n`, 4);
  });

  test("same local-label name under different scopes is allowed", () => {
    // `foo@loop` and `bar@loop` are distinct symbols, so no error.
    const s = asm(`org 0\nfoo: nop\n@loop: nop\nbar: nop\n@loop: hlt\nend\n`);
    expect(s).toHaveLength(1);
    expect(s[0].data).toEqual([0x00, 0x00, 0x00, 0x76]);
  });

  test("listing/symbolTable path also rejects duplicates", () => {
    // collectSymbols runs in lineInfo/symbolTable/lineJson too; make sure
    // the check is wired there as well.
    const src = `org 0\nfoo: nop\nfoo: hlt\nend\n`;
    let caught: unknown;
    try {
      // symbolTable goes through collectSymbols which has its own pass-1 walk.
      // Import lazily to avoid circular imports in the test header.
      const mod = require("../asm8");
      mod.symbolTable(src);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AsmError);
    expect((caught as AsmError).message).toMatch(/duplicate symbol/);
  });
});
