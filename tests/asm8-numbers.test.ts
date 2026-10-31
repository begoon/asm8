import { describe, expect, test } from "bun:test";
import { asm, AsmError } from "../asm8";

function bytes(source: string): number[] {
  return Array.from(asm(source)[0].data);
}

function catchAsm(source: string): AsmError {
  try {
    asm(source);
  } catch (e) {
    if (e instanceof AsmError) return e;
    throw e;
  }
  throw new Error("expected AsmError");
}

describe("negative 8-bit immediates", () => {
  test("mvi e,-1 assembles to 1E FF", () => {
    expect(bytes("  org 0\n  mvi e,-1\n")).toEqual([0x1e, 0xff]);
  });

  test("-128 and -256 are the lowest accepted values", () => {
    expect(bytes("  org 0\n  mvi a,-128\n")).toEqual([0x3e, 0x80]);
    expect(bytes("  org 0\n  mvi a,-256\n")).toEqual([0x3e, 0x00]);
  });

  test("negative expressions work for ALU immediates and ports", () => {
    expect(bytes("  org 0\n  adi -2\n")).toEqual([0xc6, 0xfe]);
    expect(bytes("  org 0\n  out -1\n")).toEqual([0xd3, 0xff]);
    expect(bytes("  org 0\n  cpi 0-1\n")).toEqual([0xfe, 0xff]);
  });

  test("-257 is still out of range", () => {
    const e = catchAsm("  org 0\n  mvi a,-257\n");
    expect(e.message).toBe("MVI: 8-bit value out of range: 65279");
  });

  test("256 is still out of range", () => {
    const e = catchAsm("  org 0\n  mvi a,256\n");
    expect(e.message).toBe("MVI: 8-bit value out of range: 256");
  });
});

describe("binary literals", () => {
  test("lowercase and uppercase suffixes, leading zeros, and byte limits", () => {
    expect(bytes("  org 0\n  mvi a,011b\n  db 0b,1B,11111111b\n")).toEqual([
      0x3e, 3, 0, 1, 255,
    ]);
  });

  test("binary literals work in expressions, equates, and words", () => {
    expect(
      bytes("n equ 10b\n  org 0\n  db (1b << n) | 1B,-1b\n  dw 100000000b\n"),
    ).toEqual([5, 255, 0, 1]);
  });

  test("hex literals ending in binary-looking digits stay hexadecimal", () => {
    expect(bytes("  org 0\n  db 0Bh,11Bh & 0FFh\n")).toEqual([11, 27]);
  });

  test("invalid binary digits and trailing junk are rejected", () => {
    for (const literal of ["102b", "2B", "011bb", "01b_", "01bfoo"]) {
      const e = catchAsm(`  org 0\n  db ${literal}\n`);
      expect(e.message).toContain(`invalid number: ${literal}`);
      expect(e.line).toBe(2);
    }
  });

  test("binary immediates still enforce byte range", () => {
    expect(catchAsm("  org 0\n  mvi a,100000000b\n").message).toBe(
      "MVI: 8-bit value out of range: 256",
    );
  });
});

describe("number literal validation", () => {
  test("hex without h suffix is an error, not zero", () => {
    const e = catchAsm("  org 0\n  mvi a,0FF\n");
    expect(e.message).toBe("invalid number: 0FF (missing 'h' suffix?)");
    expect(e.line).toBe(2);
  });

  test("digits followed by junk letters is an error", () => {
    const e = catchAsm("  org 0\n  mvi a,12x\n");
    expect(e.message).toBe("invalid number: 12x");
  });

  test("valid decimal and hex still work", () => {
    expect(bytes("  org 0\n  mvi a,255\n  mvi a,0FFh\n  mvi a,0ffH\n")).toEqual(
      [0x3e, 0xff, 0x3e, 0xff, 0x3e, 0xff],
    );
  });

  test("db with bad literal is rejected", () => {
    const e = catchAsm("  org 0\n  db 1, 0FF\n");
    expect(e.message).toBe("invalid number: 0FF (missing 'h' suffix?)");
  });
});
