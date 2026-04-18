import { describe, expect, test } from "bun:test";
import { asm, AsmError, symbolTable } from "../asm8";

function catchAsm(source: string): AsmError {
  try {
    asm(source);
  } catch (e) {
    if (e instanceof AsmError) return e;
    throw e;
  }
  throw new Error("expected AsmError");
}

describe("local labels", () => {
  test("local label with colon resolves relative to last normal label", () => {
    const src = [
      "  org 0",
      "foo:",
      "  nop",
      "@1:",
      "  ret",
      "  jz @1",
      "  end",
    ].join("\n");
    const sections = asm(src);
    expect(sections).toHaveLength(1);
    // foo=0, nop=0x00, @1=1 (which is foo@1), ret=0xc9, jz @1 → 0xca 0x01 0x00
    expect(sections[0].data).toEqual([0x00, 0xc9, 0xca, 0x01, 0x00]);
  });

  test("local label without colon is not recognized as a label", () => {
    const src = ["  org 0", "foo:", "@1", "  end"].join("\n");
    const e = catchAsm(src);
    expect(e.message).toBe("unknown mnemonic: @1");
  });

  test("same local label name under different scopes", () => {
    const src = [
      "  org 0",
      "alpha:",
      "  nop",
      "@loop:",
      "  jmp @loop",
      "beta:",
      "  nop",
      "@loop:",
      "  jmp @loop",
      "  end",
    ].join("\n");
    const sections = asm(src);
    // alpha=0, nop=1 byte (at 0), @loop at 1, jmp @loop → c3 01 00 (3 bytes, at 1..3)
    // beta=4, nop=1 byte (at 4), @loop at 5, jmp @loop → c3 05 00 (at 5..7)
    expect(sections[0].data).toEqual([
      0x00, 0xc3, 0x01, 0x00, 0x00, 0xc3, 0x05, 0x00,
    ]);
  });

  test("local label symbols are stored as normal@local", () => {
    const src = ["  org 100h", "foo:", "  nop", "@end:", "  ret", "  end"].join(
      "\n",
    );
    const tbl = symbolTable(src);
    expect(tbl).toContain("FOO                      0100");
    expect(tbl).toContain("FOO@END                  0101");
  });

  test("local label before any normal label errors", () => {
    const src = ["  org 0", "@1:", "  ret", "  end"].join("\n");
    const e = catchAsm(src);
    expect(e.message).toBe("local label without preceding normal label: @1");
    expect(e.line).toBe(2);
  });

  test("referencing local label without scope errors", () => {
    const src = ["  org 0", "  jz @1", "  end"].join("\n");
    const e = catchAsm(src);
    expect(e.message).toBe("local label without scope: @1");
    expect(e.line).toBe(2);
  });

  test("local label with numeric-only suffix", () => {
    const src = ["  org 0", "foo:", "@0:", "  nop", "  jmp @0", "  end"].join(
      "\n",
    );
    const sections = asm(src);
    expect(sections[0].data).toEqual([0x00, 0xc3, 0x00, 0x00]);
  });

  test("expected identifier after @", () => {
    const src = ["  org 0", "  mvi a, @", "  end"].join("\n");
    const e = catchAsm(src);
    expect(e.message).toBe("expected identifier after '@'");
  });
});

describe("$ current address", () => {
  test("$ in db", () => {
    const src = ["  org 100h", "  db $, $, $", "  end"].join("\n");
    const sections = asm(src);
    // each $ at the start of db directive = 0x100, so low byte = 0x00
    expect(sections[0].data).toEqual([0x00, 0x00, 0x00]);
  });

  test("$ in dw yields current address", () => {
    const src = ["  org 1234h", "  dw $", "  end"].join("\n");
    const sections = asm(src);
    expect(sections[0].data).toEqual([0x34, 0x12]);
  });

  test("$ in instruction operand", () => {
    const src = ["  org 100h", "  jmp $", "  end"].join("\n");
    const sections = asm(src);
    expect(sections[0].data).toEqual([0xc3, 0x00, 0x01]);
  });

  test("$ with arithmetic", () => {
    const src = ["  org 100h", "  jmp $+3", "  nop", "  end"].join("\n");
    const sections = asm(src);
    // jmp at 0x100, $+3 = 0x103, then nop at 0x103
    expect(sections[0].data).toEqual([0xc3, 0x03, 0x01, 0x00]);
  });

  test("$ in equ uses current pc", () => {
    const src = [
      "  org 200h",
      "  nop",
      "  nop",
      "here equ $",
      "  jmp here",
      "  end",
    ].join("\n");
    const sections = asm(src);
    // nop nop at 0x200,0x201; here=0x202; jmp here → c3 02 02
    expect(sections[0].data).toEqual([0x00, 0x00, 0xc3, 0x02, 0x02]);
  });

  test("$ in org", () => {
    const src = [
      "  org 100h",
      "  db 1,2,3",
      "  org $+10h",
      "  db 4",
      "  end",
    ].join("\n");
    const sections = asm(src);
    expect(sections).toHaveLength(2);
    expect(sections[0].start).toBe(0x100);
    expect(sections[1].start).toBe(0x113);
  });
});
