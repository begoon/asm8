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

describe(".proc / .endp / .return", () => {
  test("basic .proc saves and restores registers in stack order", () => {
    // abc .proc psw, h → abc: push psw, push h, ...body..., pop h, pop psw, ret
    const src = [
      "  org 0",
      "abc .proc psw, h",
      "  mov a, b",
      ".endp",
      "  end",
    ].join("\n");
    const s = asm(src);
    // PUSH PSW (F5), PUSH H (E5), MOV A,B (78), POP H (E1), POP PSW (F1), RET (C9)
    expect(s[0].data).toEqual([0xf5, 0xe5, 0x78, 0xe1, 0xf1, 0xc9]);
    expect(symbolTable(src)).toContain("ABC");
  });

  test(".proc with all four pairs", () => {
    const src = [
      "  org 0",
      "foo .proc psw, b, d, h",
      "  nop",
      ".endp",
      "  end",
    ].join("\n");
    const s = asm(src);
    // F5 C5 D5 E5 00 E1 D1 C1 F1 C9
    expect(s[0].data).toEqual([
      0xf5, 0xc5, 0xd5, 0xe5, 0x00, 0xe1, 0xd1, 0xc1, 0xf1, 0xc9,
    ]);
  });

  test(".proc with no registers just emits label + ret", () => {
    const src = ["  org 0", "foo .proc", "  nop", ".endp", "  end"].join("\n");
    const s = asm(src);
    // NOP (00), RET (C9)
    expect(s[0].data).toEqual([0x00, 0xc9]);
  });

  test(".proc with colon on label", () => {
    const src = ["  org 0", "foo: .proc h", "  nop", ".endp", "  end"].join(
      "\n",
    );
    const s = asm(src);
    // PUSH H (E5), NOP (00), POP H (E1), RET (C9)
    expect(s[0].data).toEqual([0xe5, 0x00, 0xe1, 0xc9]);
  });

  test(".return emits pops+ret before .endp", () => {
    const src = [
      "  org 0",
      "foo .proc h",
      "  cpi 0",
      "  .if Z",
      "    .return",
      "  .endif",
      "  mov a, b",
      ".endp",
      "  end",
    ].join("\n");
    const s = asm(src);
    // foo: (0), PUSH H (E5, @0), CPI 0 (FE 00, @1), JNZ else (C2 08 00, @3),
    //   POP H (E1, @6), RET (C9, @7), else: MOV A,B (78, @8),
    //   POP H (E1, @9), RET (C9, @10)
    expect(s[0].data).toEqual([
      0xe5, 0xfe, 0x00, 0xc2, 0x08, 0x00, 0xe1, 0xc9, 0x78, 0xe1, 0xc9,
    ]);
  });

  test("local labels inside .proc scope to the proc name", () => {
    const src = [
      "  org 0",
      "foo .proc h",
      "@loop:",
      "  jmp @loop",
      ".endp",
      "  end",
    ].join("\n");
    const s = asm(src);
    // PUSH H (E5 @0), @loop=1, JMP @loop (C3 01 00 @1), POP H (E1 @4), RET (C9 @5)
    expect(s[0].data).toEqual([0xe5, 0xc3, 0x01, 0x00, 0xe1, 0xc9]);
    expect(symbolTable(src)).toContain("FOO@LOOP");
  });

  test("comma- and space-separated register lists both work", () => {
    const srcC = ["org 0", "foo .proc psw, h", ".endp"].join("\n");
    const srcS = ["org 0", "foo .proc psw h", ".endp"].join("\n");
    expect(asm(srcC)[0].data).toEqual(asm(srcS)[0].data);
  });

  test("dotless forms: proc / endp / return work the same as dotted", () => {
    const src = [
      "  org 0",
      "abc proc psw, h",
      "  cpi 0",
      "  if Z",
      "    return",
      "  endif",
      "  mov a, b",
      "endp",
      "  end",
    ].join("\n");
    const s = asm(src);
    // Same layout as the .return-inside-.if test above:
    // PUSH PSW (F5 @0), PUSH H (E5 @1), CPI 0 (FE 00 @2), JNZ else (C2 0A 00 @4),
    //   POP H (E1 @7), POP PSW (F1 @8), RET (C9 @9),
    //   else: MOV A,B (78 @A), POP H (E1 @B), POP PSW (F1 @C), RET (C9 @D)
    expect(s[0].data).toEqual([
      0xf5, 0xe5, 0xfe, 0x00, 0xc2, 0x0a, 0x00, 0xe1, 0xf1, 0xc9, 0x78, 0xe1,
      0xf1, 0xc9,
    ]);
  });

  test("dotless: label named 'proc' still works with colon", () => {
    // `proc:` alone is a label definition, not a directive.
    const src = [
      "  org 0",
      "proc:",
      "  ret",
      "caller:",
      "  call proc",
      "  end",
    ].join("\n");
    const s = asm(src);
    // proc: RET (C9 @0), caller: CALL proc (CD 00 00 @1)
    expect(s[0].data).toEqual([0xc9, 0xcd, 0x00, 0x00]);
  });

  test("dotless: 'proc' with args but no label errors", () => {
    const src = ["  org 0", "  proc psw", ".endp"].join("\n");
    const e = catchAsm(src);
    expect(e.message).toBe(".proc requires a label");
    expect(e.line).toBe(2);
  });

  test("case-insensitive directive and register names", () => {
    const src = ["  org 0", "foo .PROC Psw, h", "  nop", ".EndP", "  end"].join(
      "\n",
    );
    const s = asm(src);
    expect(s[0].data).toEqual([0xf5, 0xe5, 0x00, 0xe1, 0xf1, 0xc9]);
  });

  test("invalid register errors", () => {
    const src = ["  org 0", "foo .proc psw, x", ".endp"].join("\n");
    const e = catchAsm(src);
    expect(e.message).toBe(
      "invalid .proc register: x (expected PSW, B, D, or H)",
    );
    expect(e.line).toBe(2);
  });

  test(".proc without label errors", () => {
    const src = ["  org 0", "  .proc psw", ".endp"].join("\n");
    const e = catchAsm(src);
    expect(e.message).toBe(".proc requires a label");
    expect(e.line).toBe(2);
  });

  test(".endp without .proc errors", () => {
    const src = ["  org 0", "  .endp"].join("\n");
    const e = catchAsm(src);
    expect(e.message).toBe(".endp without .proc");
    expect(e.line).toBe(2);
  });

  test(".return outside .proc errors", () => {
    const src = ["  org 0", "  .return"].join("\n");
    const e = catchAsm(src);
    expect(e.message).toBe(".return outside .proc");
    expect(e.line).toBe(2);
  });

  test(".proc without .endp errors at the .proc line", () => {
    const src = ["  org 0", "foo .proc h", "  nop"].join("\n");
    const e = catchAsm(src);
    expect(e.message).toBe(".proc without .endp");
    expect(e.line).toBe(2);
  });

  test("nested .proc errors", () => {
    const src = [
      "  org 0",
      "outer .proc h",
      "inner .proc b",
      ".endp",
      ".endp",
    ].join("\n");
    const e = catchAsm(src);
    expect(e.message).toBe("nested .proc not allowed");
    expect(e.line).toBe(3);
  });

  test("line numbers in errors survive proc expansion", () => {
    const src = ["  org 0", "foo .proc h", "  blarg", ".endp", "  end"].join(
      "\n",
    );
    const e = catchAsm(src);
    expect(e.message).toBe("unknown mnemonic: BLARG");
    expect(e.line).toBe(3);
  });
});
