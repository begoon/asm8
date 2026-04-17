import { describe, expect, test } from "bun:test";
import { asm, AsmError, listing } from "../asm8";

function bytes(body: string): number[] {
  const s = asm(`org 0\n${body}\nend\n`);
  expect(s).toHaveLength(1);
  return s[0].data;
}

describe("slash-joined statements", () => {
  test("three push instructions on one line", () => {
    expect(bytes("push h / push b / push d")).toEqual([0xe5, 0xc5, 0xd5]);
  });

  test("two instructions on one line", () => {
    expect(bytes("nop / hlt")).toEqual([0x00, 0x76]);
  });

  test("mixing operands and separator", () => {
    // mvi a, 5 ; hlt
    expect(bytes("mvi a, 5 / hlt")).toEqual([0x3e, 0x05, 0x76]);
  });

  test("label stays with first statement", () => {
    const s = asm(`org 100h\nfoo: push h / push b\nend\n`);
    expect(s[0].start).toBe(0x0100);
    expect(s[0].data).toEqual([0xe5, 0xc5]);
  });

  test("division expression is NOT split", () => {
    // mvi a, 10 / 2  => 10/2 = 5, both sides are numbers so right token is
    // not a mnemonic, no split.
    expect(bytes("mvi a, 10 / 2")).toEqual([0x3e, 0x05]);
  });

  test("division without spaces is NOT split", () => {
    expect(bytes("mvi a, 10/2")).toEqual([0x3e, 0x05]);
  });

  test("slash without trailing space is NOT split", () => {
    // " /hlt" — no space after slash, rule requires " / ".
    expect(bytes("mvi a, 1 /2")).toEqual([0x3e, (0x01 / 2) & 0xff]);
  });

  test("slash inside string literal not split", () => {
    expect(bytes(`db "a / b"`)).toEqual([0x61, 0x20, 0x2f, 0x20, 0x62]);
  });

  test("slash inside char literal not split", () => {
    // '/' is a single char with value 0x2f
    expect(bytes("db '/'")).toEqual([0x2f]);
  });

  test("dotted directive also counts as valid mnemonic", () => {
    expect(bytes("db 1 / .db 2")).toEqual([0x01, 0x02]);
  });

  test("end terminates even when on joined line", () => {
    const s = asm(`org 0\nhlt / end / nop\n`);
    expect(s[0].data).toEqual([0x76]);
  });

  test("more than 10 statements throws AsmError", () => {
    const eleven = Array(11).fill("nop").join(" / ");
    let caught: unknown;
    try {
      asm(`org 0\n${eleven}\nend\n`);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AsmError);
    expect((caught as AsmError).message).toMatch(/too many statements/);
    expect((caught as AsmError).line).toBe(2);
  });

  test("exactly 10 statements is allowed", () => {
    const ten = Array(10).fill("nop").join(" / ");
    expect(bytes(ten)).toEqual(Array(10).fill(0x00));
  });

  test("errors on second statement still report original line", () => {
    // "push b / badop" — badop isn't a mnemonic so no split happens, but the
    // whole line becomes a parse error. Use valid mnemonic to get a split then
    // error inside it.
    const src = `org 0\npush h / mvi a, UNDEFINED\nend\n`;
    let caught: unknown;
    try {
      asm(src);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AsmError);
    expect((caught as AsmError).line).toBe(2);
    expect((caught as AsmError).source).toBe("push h / mvi a, UNDEFINED");
  });

  test("listing renders source on first statement only", () => {
    const src = `org 0\npush h / push b / push d\nend\n`;
    const out = listing(src);
    const rows = out.split("\n");
    // find the row containing the source
    const pushRows = rows.filter((r) => r.includes("push"));
    // only one row should contain the source text
    expect(pushRows).toHaveLength(1);
    expect(pushRows[0]).toContain("push h / push b / push d");
    // and the listing should include all three byte rows
    expect(rows.some((r) => r.includes("0000: E5"))).toBe(true);
    expect(rows.some((r) => r.includes("0001: C5"))).toBe(true);
    expect(rows.some((r) => r.includes("0002: D5"))).toBe(true);
  });
});
