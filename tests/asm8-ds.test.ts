import { describe, expect, test } from "bun:test";
import { asm, AsmError, listing } from "../asm8";

function bytes(body: string): number[] {
  const s = asm(`org 0\n${body}\nend\n`);
  expect(s).toHaveLength(1);
  return s[0].data;
}

describe("ds directive", () => {
  test("ds N reserves N zero bytes", () => {
    expect(bytes("ds 4")).toEqual([0, 0, 0, 0]);
  });

  test("ds 0 reserves nothing", () => {
    expect(bytes("ds 0 / hlt")).toEqual([0x76]);
  });

  test("ds N (F) fills with F", () => {
    expect(bytes("ds 3 (0FFh)")).toEqual([0xff, 0xff, 0xff]);
  });

  test("fill value is truncated to byte", () => {
    expect(bytes("ds 2 (0FF34h)")).toEqual([0x34, 0x34]);
  });

  test("count can be an expression", () => {
    const body = `COUNT equ 2+3\nds COUNT`;
    expect(bytes(body)).toEqual([0, 0, 0, 0, 0]);
  });

  test("fill can be an expression", () => {
    expect(bytes("ds 2 (16 + 1)")).toEqual([17, 17]);
  });

  test("ds contributes to section size and pc", () => {
    const s = asm(
      [
        "org 0",
        "start: ds 4",
        "after: hlt",
        "dw start",
        "dw after",
        "end",
      ].join("\n"),
    );
    // 4 reserved + hlt + 2*dw = 9 bytes
    expect(s[0].data.length).toBe(9);
    // last 4 bytes: dw start=0, dw after=4
    expect(s[0].data.slice(-4)).toEqual([0x00, 0x00, 0x04, 0x00]);
  });

  test("dotted .ds works", () => {
    expect(bytes(".ds 2 (0AAh)")).toEqual([0xaa, 0xaa]);
  });

  test("ds combined with slash separator", () => {
    expect(bytes("ds 2 / ds 1 (0FFh)")).toEqual([0, 0, 0xff]);
  });

  test("listing shows address + source only, not bytes", () => {
    const src = `org 0\nbuf: ds 1000 (0FFh)\nhlt\nend\n`;
    const out = listing(src);
    const rows = out.split("\n");
    const dsRows = rows.filter((r) => r.includes("ds 1000"));
    expect(dsRows).toHaveLength(1);
    expect(dsRows[0]).toContain("0000:");
    // should not contain dumped FF bytes as hex in a row prefix
    expect(rows.every((r) => !/^[0-9A-F]{4}: FF FF/.test(r))).toBe(true);
    // pc advanced past the reservation: HLT at 0x03E8 (= 1000)
    expect(rows.some((r) => r.includes("03E8: 76"))).toBe(true);
  });

  test("symbol defined after DS has correct address (pass 1 size tracking)", () => {
    const src = ["org 100h", "ds 10", "here: hlt", "dw here", "end"].join("\n");
    const s = asm(src);
    // here = 0x100 + 10 = 0x10A
    // last two bytes are dw here = 0A 01
    expect(s[0].data.slice(-2)).toEqual([0x0a, 0x01]);
  });

  test("missing operand throws AsmError", () => {
    let caught: unknown;
    try {
      asm("org 0\nds\nend\n");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AsmError);
    expect((caught as AsmError).message).toMatch(/DS takes one operand/);
  });

  test("multiple comma operands throws AsmError", () => {
    let caught: unknown;
    try {
      asm("org 0\nds 3, 5\nend\n");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AsmError);
    expect((caught as AsmError).message).toMatch(/DS takes one operand/);
  });
});
