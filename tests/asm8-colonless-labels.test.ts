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

describe("colonless labels", () => {
  test("colonless label before instruction", () => {
    const src = ["  org 0", "start mov a, b", "  end"].join("\n");
    const sections = asm(src);
    expect(sections[0].data).toEqual([0x78]);
    expect(symbolTable(src)).toContain("START");
  });

  test("colonless label before directive", () => {
    const src = ["  org 0", "msg db 'hi'", "  end"].join("\n");
    const sections = asm(src);
    expect(sections[0].data).toEqual([0x68, 0x69]);
    expect(symbolTable(src)).toContain("MSG");
  });

  test("colonless local label", () => {
    const src = ["  org 0", "foo:", "  nop", "@loop jmp @loop", "  end"].join(
      "\n",
    );
    const sections = asm(src);
    expect(sections[0].data).toEqual([0x00, 0xc3, 0x01, 0x00]);
  });

  test("colonless dot-local label", () => {
    const src = ["  org 0", "foo:", "  nop", ".loop jmp .loop", "  end"].join(
      "\n",
    );
    const sections = asm(src);
    expect(sections[0].data).toEqual([0x00, 0xc3, 0x01, 0x00]);
  });

  test("colon still required when label is alone on a line", () => {
    const src = ["  org 0", "lonely", "  hlt", "  end"].join("\n");
    const e = catchAsm(src);
    expect(e.message).toBe("unknown mnemonic: LONELY");
  });

  test("unknown second token still errors as unknown mnemonic", () => {
    const src = ["  org 0", "blarg a, b", "  hlt"].join("\n");
    const e = catchAsm(src);
    expect(e.message).toBe("unknown mnemonic: BLARG");
  });

  test("colonless label with dot-prefixed directive", () => {
    const src = ["  .org 0", "msg .db 42", "  .end"].join("\n");
    const sections = asm(src);
    expect(sections[0].data).toEqual([42]);
    expect(symbolTable(src)).toContain("MSG");
  });

  test("equ still works without colon (unchanged)", () => {
    const src = ["val equ 42h", "  org 0", "  mvi a, val", "  end"].join("\n");
    const sections = asm(src);
    expect(sections[0].data).toEqual([0x3e, 0x42]);
  });

  test("equ now works with colon too", () => {
    const src = ["val: equ 42h", "  org 0", "  mvi a, val", "  end"].join("\n");
    const sections = asm(src);
    expect(sections[0].data).toEqual([0x3e, 0x42]);
  });

  test("mnemonic alone is still an instruction, not a label", () => {
    const src = ["  org 0", "nop", "  end"].join("\n");
    const sections = asm(src);
    expect(sections[0].data).toEqual([0x00]);
  });
});
