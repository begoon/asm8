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

describe(".if / .else / .endif", () => {
  test(".if Z with no else emits JNZ past body", () => {
    // CPI 11h (FE 11), JNZ _exit (C2 06 00), MOV A,B (78), label _exit
    const src = [
      "main:",
      "  org 0",
      "  cpi 11h",
      "  .if Z",
      "    mov a, b",
      "  .endif",
      "  hlt",
      "  end",
    ].join("\n");
    const s = asm(src);
    expect(s[0].data).toEqual([0xfe, 0x11, 0xc2, 0x06, 0x00, 0x78, 0x76]);
  });

  test(".if Z with .else emits JNZ to else, JMP past end", () => {
    // CPI 11 (FE 11) @0, JNZ else @2, MOV A,B @5, JMP exit @6,
    // else: MOV A,C @9, exit: HLT @10
    const src = [
      "main:",
      "  org 0",
      "  cpi 11h",
      "  .if Z",
      "    mov a, b",
      "  .else",
      "    mov a, c",
      "  .endif",
      "  hlt",
      "  end",
    ].join("\n");
    const s = asm(src);
    expect(s[0].data).toEqual([
      0xfe, 0x11, 0xc2, 0x09, 0x00, 0x78, 0xc3, 0x0a, 0x00, 0x79, 0x76,
    ]);
  });

  test("== and <> alias Z / NZ", () => {
    const srcEq = [
      "main:",
      "org 0",
      "cpi 5",
      ".if ==",
      "mov a, b",
      ".endif",
    ].join("\n");
    const srcNe = [
      "main:",
      "org 0",
      "cpi 5",
      ".if <>",
      "mov a, b",
      ".endif",
    ].join("\n");
    // == → JNZ (C2), <> → JZ (CA); exit label lands at pc=6.
    expect(asm(srcEq)[0].data.slice(0, 5)).toEqual([
      0xfe, 0x05, 0xc2, 0x06, 0x00,
    ]);
    expect(asm(srcNe)[0].data.slice(0, 5)).toEqual([
      0xfe, 0x05, 0xca, 0x06, 0x00,
    ]);
  });

  test("each flag inverts correctly", () => {
    const cases: Array<[string, number]> = [
      ["Z", 0xc2],
      ["NZ", 0xca],
      ["C", 0xd2],
      ["NC", 0xda],
      ["PO", 0xea],
      ["PE", 0xe2],
      ["P", 0xfa],
      ["M", 0xf2],
    ];
    for (const [cond, op] of cases) {
      const src = [
        "main:",
        "  org 0",
        `  .if ${cond}`,
        "    nop",
        "  .endif",
        "  end",
      ].join("\n");
      const s = asm(src);
      expect(s[0].data[0]).toBe(op);
    }
  });

  test("nested .if blocks get independent labels", () => {
    // main: CPI 1 / .if Z / CPI 2 / .if NZ / MOV A,B / .endif / .endif
    // bytes:
    //   CPI 1 (FE 01)
    //   JNZ outer_else (C2 0B 00)  ← outer skip past body
    //   CPI 2 (FE 02)
    //   JZ inner_else (CA 0B 00)   ← inner inverted
    //   MOV A,B (78)
    //   inner_else: (no code)
    //   outer_else: HLT
    const src = [
      "main:",
      "  org 0",
      "  cpi 1",
      "  .if Z",
      "    cpi 2",
      "    .if NZ",
      "      mov a, b",
      "    .endif",
      "  .endif",
      "  hlt",
      "  end",
    ].join("\n");
    const s = asm(src);
    expect(s[0].data).toEqual([
      0xfe, 0x01, 0xc2, 0x0b, 0x00, 0xfe, 0x02, 0xca, 0x0b, 0x00, 0x78, 0x76,
    ]);
  });

  test("dotless forms: if / else / endif work the same as dotted", () => {
    const src = [
      "main:",
      "  org 0",
      "  if Z",
      "    nop",
      "  else",
      "    hlt",
      "  endif",
      "  end",
    ].join("\n");
    const s = asm(src);
    // JNZ else @0, NOP @3, JMP exit @4, else: HLT @7, exit: @8
    expect(s[0].data).toEqual([0xc2, 0x07, 0x00, 0x00, 0xc3, 0x08, 0x00, 0x76]);
  });

  test("case-insensitive directive names", () => {
    const src = [
      "main:",
      "  org 0",
      "  .IF z",
      "    nop",
      "  .Else",
      "    hlt",
      "  .ENDIF",
      "  end",
    ].join("\n");
    const s = asm(src);
    // JNZ else @0, NOP @3, JMP exit @4, else: HLT @7, exit: @8
    expect(s[0].data).toEqual([0xc2, 0x07, 0x00, 0x00, 0xc3, 0x08, 0x00, 0x76]);
  });

  test("labels inside .if body resolve correctly", () => {
    const src = [
      "main:",
      "  org 0",
      "  cpi 0",
      "  .if NZ",
      "@loop:",
      "    jmp @loop",
      "  .endif",
      "  end",
    ].join("\n");
    const s = asm(src);
    // CPI 0 (FE 00), JZ past (CA 08 00), @loop=0005: JMP @loop (C3 05 00)
    expect(s[0].data).toEqual([0xfe, 0x00, 0xca, 0x08, 0x00, 0xc3, 0x05, 0x00]);
  });

  test("line numbers in errors survive preprocessing", () => {
    const src = ["main:", "  org 0", "  .if Z", "  blarg", "  .endif"].join(
      "\n",
    );
    const e = catchAsm(src);
    expect(e.message).toBe("unknown mnemonic: BLARG");
    expect(e.line).toBe(4);
  });

  test(".if without .endif errors at the .if line", () => {
    const src = ["main:", "  org 0", "  .if Z", "  nop"].join("\n");
    const e = catchAsm(src);
    expect(e.message).toBe(".if without .endif");
    expect(e.line).toBe(3);
  });

  test(".endif without .if errors", () => {
    const src = ["main:", "  org 0", "  .endif"].join("\n");
    const e = catchAsm(src);
    expect(e.message).toBe(".endif without .if");
    expect(e.line).toBe(3);
  });

  test(".else without .if errors", () => {
    const src = ["main:", "  org 0", "  .else"].join("\n");
    const e = catchAsm(src);
    expect(e.message).toBe(".else without .if");
    expect(e.line).toBe(3);
  });

  test("duplicate .else errors", () => {
    const src = [
      "main:",
      "  org 0",
      "  .if Z",
      "    nop",
      "  .else",
      "    nop",
      "  .else",
      "  .endif",
    ].join("\n");
    const e = catchAsm(src);
    expect(e.message).toBe("duplicate .else");
    expect(e.line).toBe(7);
  });

  test("unknown .if condition errors", () => {
    const src = ["main:", "  org 0", "  .if FOO", "  .endif"].join("\n");
    const e = catchAsm(src);
    expect(e.message).toBe("unknown .if condition: FOO");
    expect(e.line).toBe(3);
  });

  test("internal labels appear in symbol table under current scope", () => {
    const src = [
      "main:",
      "  org 0",
      "  cpi 0",
      "  .if Z",
      "    nop",
      "  .endif",
      "  end",
    ].join("\n");
    const sym = symbolTable(src);
    // Generated label is @_if_0_else, scoped to `main`.
    expect(sym).toContain("MAIN@_IF_0_ELSE");
  });
});
