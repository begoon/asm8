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

  test("dot-prefixed local label with colon", () => {
    const src = [
      "  org 0",
      "foo:",
      "  nop",
      ".loop:",
      "  ret",
      "  jz .loop",
      "  end",
    ].join("\n");
    const sections = asm(src);
    expect(sections[0].data).toEqual([0x00, 0xc9, 0xca, 0x01, 0x00]);
  });

  test("dot-prefixed local label stored as normal.local", () => {
    const src = ["  org 100h", "foo:", "  nop", ".end:", "  ret", "  end"].join(
      "\n",
    );
    const tbl = symbolTable(src);
    expect(tbl).toContain("FOO                      0100");
    expect(tbl).toContain("FOO.END                  0101");
  });

  test("same dot-local name under different scopes", () => {
    const src = [
      "  org 0",
      "alpha:",
      "  nop",
      ".loop:",
      "  jmp .loop",
      "beta:",
      "  nop",
      ".loop:",
      "  jmp .loop",
      "  end",
    ].join("\n");
    const sections = asm(src);
    expect(sections[0].data).toEqual([
      0x00, 0xc3, 0x01, 0x00, 0x00, 0xc3, 0x05, 0x00,
    ]);
  });

  test("dot-local before any normal label errors", () => {
    const src = ["  org 0", ".loop:", "  ret", "  end"].join("\n");
    const e = catchAsm(src);
    expect(e.message).toBe("local label without preceding normal label: .loop");
    expect(e.line).toBe(2);
  });

  test("referencing dot-local without scope errors", () => {
    const src = ["  org 0", "  jz .loop", "  end"].join("\n");
    const e = catchAsm(src);
    expect(e.message).toBe("local label without scope: .loop");
    expect(e.line).toBe(2);
  });

  test("expected identifier after .", () => {
    const src = ["  org 0", "  mvi a, .", "  end"].join("\n");
    const e = catchAsm(src);
    expect(e.message).toBe("expected identifier after '.'");
  });

  test(".org directive still works alongside dot-local labels", () => {
    const src = [
      "  .org 100h",
      "foo:",
      "  nop",
      ".skip:",
      "  jmp .skip",
      "  .end",
    ].join("\n");
    const sections = asm(src);
    expect(sections[0].start).toBe(0x100);
    expect(sections[0].data).toEqual([0x00, 0xc3, 0x01, 0x01]);
  });

  test("mixing @ and . locals in the same scope", () => {
    const src = [
      "  org 0",
      "foo:",
      "@a:",
      "  nop",
      ".b:",
      "  jmp @a",
      "  jmp .b",
      "  end",
    ].join("\n");
    const sections = asm(src);
    // @a=0, nop at 0, .b=1, jmp @a -> c3 00 00, jmp .b -> c3 01 00
    expect(sections[0].data).toEqual([
      0x00, 0xc3, 0x00, 0x00, 0xc3, 0x01, 0x00,
    ]);
    const tbl = symbolTable(src);
    expect(tbl).toContain("FOO@A");
    expect(tbl).toContain("FOO.B");
  });

  test("forward reference to dot-local", () => {
    const src = [
      "  org 0",
      "foo:",
      "  jmp .end",
      "  nop",
      ".end:",
      "  ret",
      "  end",
    ].join("\n");
    const sections = asm(src);
    // jmp .end -> c3 04 00 (.end is at pc=4), nop at 3, ret at 4
    expect(sections[0].data).toEqual([0xc3, 0x04, 0x00, 0x00, 0xc9]);
  });

  test("dot-local in expression arithmetic", () => {
    const src = [
      "  org 0",
      "foo:",
      ".start:",
      "  nop",
      "  nop",
      "  nop",
      "len equ $ - .start",
      "  mvi a, len",
      "  end",
    ].join("\n");
    const sections = asm(src);
    // 3 nops, then mvi a, 3 -> 3e 03
    expect(sections[0].data).toEqual([0x00, 0x00, 0x00, 0x3e, 0x03]);
  });

  test("dot-local in db and dw operands", () => {
    const src = [
      "  org 100h",
      "foo:",
      "  nop",
      ".here:",
      "  dw .here",
      "  db low(.here), high(.here)",
      "  end",
    ].join("\n");
    const sections = asm(src);
    // nop at 100, .here=101, dw .here -> 01 01, db low/high of 0x101 -> 01 01
    expect(sections[0].data).toEqual([0x00, 0x01, 0x01, 0x01, 0x01]);
  });

  test("dot-local survives statement splitting on /", () => {
    const src = ["  org 0", "foo:", ".loop: / nop / jmp .loop", "  end"].join(
      "\n",
    );
    const sections = asm(src);
    // .loop=0, nop at 0, jmp .loop -> c3 00 00
    expect(sections[0].data).toEqual([0x00, 0xc3, 0x00, 0x00]);
  });

  test("dot-local with numeric suffix", () => {
    const src = ["  org 0", "foo:", ".0:", "  nop", "  jmp .0", "  end"].join(
      "\n",
    );
    const sections = asm(src);
    expect(sections[0].data).toEqual([0x00, 0xc3, 0x00, 0x00]);
  });

  test("dot-local can be referenced in equ value", () => {
    const src = [
      "  org 0",
      "foo:",
      ".target:",
      "  nop",
      "alias equ .target",
      "  jmp alias",
      "  end",
    ].join("\n");
    const sections = asm(src);
    expect(sections[0].data).toEqual([0x00, 0xc3, 0x00, 0x00]);
  });

  test("dot-local does not become the new scope for following @ locals", () => {
    // ensure that dot-locals (like @-locals) don't reset lastLabel
    const src = [
      "  org 0",
      "foo:",
      ".a:",
      "  nop",
      "@b:",
      "  jmp @b", // should resolve to foo@b, not .a@b
      "  jmp .a", // should still resolve to foo.a
      "  end",
    ].join("\n");
    const sections = asm(src);
    expect(sections[0].data).toEqual([
      0x00, 0xc3, 0x01, 0x00, 0xc3, 0x00, 0x00,
    ]);
    const tbl = symbolTable(src);
    expect(tbl).toContain("FOO.A");
    expect(tbl).toContain("FOO@B");
    expect(tbl).not.toContain(".A@B");
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
