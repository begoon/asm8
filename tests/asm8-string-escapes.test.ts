import { describe, expect, test } from "bun:test";
import { asm, AsmError } from "../asm8";

function bytes(body: string): number[] {
  const s = asm(`org 0\n${body}\nend\n`);
  expect(s).toHaveLength(1);
  return s[0].data;
}

describe("string escape sequences", () => {
  test("\\\\ encodes a literal backslash", () => {
    expect(bytes(`db "a\\\\b"`)).toEqual([0x61, 0x5c, 0x62]);
  });

  test('\\" encodes a literal double quote inside double-quoted string', () => {
    expect(bytes(`db "a\\"b"`)).toEqual([0x61, 0x22, 0x62]);
  });

  test("\\' encodes a literal single quote inside single-quoted string", () => {
    expect(bytes(`db 'a\\'b'`)).toEqual([0x61, 0x27, 0x62]);
  });

  test("\\n \\r \\t \\0 decode to control bytes", () => {
    expect(bytes(`db "\\n\\r\\t\\0"`)).toEqual([0x0a, 0x0d, 0x09, 0x00]);
  });

  test("unknown escape raises AsmError", () => {
    let caught: unknown;
    try {
      asm(`org 0\ndb "\\x"\nend\n`);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AsmError);
    expect((caught as AsmError).message).toMatch(/unknown escape/);
  });

  test("dangling backslash at end of string raises AsmError", () => {
    let caught: unknown;
    try {
      asm(`org 0\ndb "abc\\"\nend\n`);
    } catch (e) {
      caught = e;
    }
    // The unterminated form `"abc\"` reaches our scanner as an open string;
    // depending on tokenization it surfaces as a dangling-escape or a parse
    // error. Either way it must NOT succeed.
    expect(caught).toBeInstanceOf(AsmError);
  });

  test("escaped quote inside string does not terminate the operand split", () => {
    // db "a\"b", 0  — single string operand containing an embedded quote.
    expect(bytes(`db "a\\"b", 0`)).toEqual([0x61, 0x22, 0x62, 0x00]);
  });

  test("escaped quote inside string does not terminate the comment scan", () => {
    // db "a\";b" — without escape handling, the scanner would see the
    // close-quote after `a\` and treat `;b"` as a comment.
    expect(bytes(`db "a\\";b"`)).toEqual([0x61, 0x22, 0x3b, 0x62]);
  });

  test("char literal in expression supports escapes", () => {
    expect(bytes(`db '\\n'`)).toEqual([0x0a]);
    expect(bytes(`db '\\\\'`)).toEqual([0x5c]);
    expect(bytes(`db '\\''`)).toEqual([0x27]);
  });
});
