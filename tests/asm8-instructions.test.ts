import { describe, expect, test } from "bun:test";
import { asm } from "../asm8";

/** Assemble body (wrapped in org 0 / end) and return bytes */
function bytes(body: string): number[] {
    const s = asm(`org 0\n${body}\nend\n`);
    expect(s).toHaveLength(1);
    return s[0].data;
}

const REGS = ["b", "c", "d", "e", "h", "l", "m", "a"] as const;
const REG_N: Record<string, number> = {
    b: 0,
    c: 1,
    d: 2,
    e: 3,
    h: 4,
    l: 5,
    m: 6,
    a: 7,
};

// ---------------------------------------------------------------------------
// Implied / no-operand instructions
// ---------------------------------------------------------------------------
describe("implied instructions", () => {
    const cases: [string, number][] = [
        ["nop", 0x00],
        ["hlt", 0x76],
        ["ret", 0xc9],
        ["xchg", 0xeb],
        ["ei", 0xfb],
        ["di", 0xf3],
        ["cma", 0x2f],
        ["stc", 0x37],
        ["cmc", 0x3f],
        ["daa", 0x27],
        ["rlc", 0x07],
        ["rrc", 0x0f],
        ["ral", 0x17],
        ["rar", 0x1f],
        ["pchl", 0xe9],
        ["sphl", 0xf9],
        ["xthl", 0xe3],
    ];
    for (const [mn, op] of cases) test(mn, () => expect(bytes(mn)).toEqual([op]));
});

describe("conditional returns", () => {
    const cases: [string, number][] = [
        ["rnz", 0xc0],
        ["rz", 0xc8],
        ["rnc", 0xd0],
        ["rc", 0xd8],
        ["rpo", 0xe0],
        ["rpe", 0xe8],
        ["rp", 0xf0],
        ["rm", 0xf8],
    ];
    for (const [mn, op] of cases) test(mn, () => expect(bytes(mn)).toEqual([op]));
});

// ---------------------------------------------------------------------------
// MOV - all 63 valid register combinations (M,M excluded = HLT)
// ---------------------------------------------------------------------------
test("MOV - all valid register combinations", () => {
    let src = "";
    const expected: number[] = [];
    for (const dst of REGS) {
        for (const s of REGS) {
            if (dst === "m" && s === "m") continue;
            src += `mov ${dst}, ${s}\n`;
            expected.push(0x40 | (REG_N[dst] << 3) | REG_N[s]);
        }
    }
    expect(bytes(src)).toEqual(expected);
});

// ---------------------------------------------------------------------------
// MVI - all 8 registers with distinct immediates
// ---------------------------------------------------------------------------
test("MVI - all registers", () => {
    let src = "";
    const expected: number[] = [];
    for (let i = 0; i < 8; i++) {
        const imm = (i + 1) * 0x10;
        src += `mvi ${REGS[i]}, ${imm.toString(16)}h\n`;
        expected.push(0x06 | (i << 3), imm);
    }
    expect(bytes(src)).toEqual(expected);
});

// ---------------------------------------------------------------------------
// ALU register operations - 8 ops x 8 registers = 64 instructions
// ---------------------------------------------------------------------------
test("ALU register - all 64 combinations", () => {
    const ops: [string, number][] = [
        ["add", 0x80],
        ["adc", 0x88],
        ["sub", 0x90],
        ["sbb", 0x98],
        ["ana", 0xa0],
        ["xra", 0xa8],
        ["ora", 0xb0],
        ["cmp", 0xb8],
    ];
    let src = "";
    const expected: number[] = [];
    for (const [mn, base] of ops) {
        for (let i = 0; i < 8; i++) {
            src += `${mn} ${REGS[i]}\n`;
            expected.push(base | i);
        }
    }
    expect(bytes(src)).toEqual(expected);
});

// ---------------------------------------------------------------------------
// ALU immediate operations
// ---------------------------------------------------------------------------
test("ALU immediate - all 8 operations", () => {
    const ops: [string, number, number][] = [
        ["adi", 0xc6, 0x11],
        ["aci", 0xce, 0x22],
        ["sui", 0xd6, 0x33],
        ["sbi", 0xde, 0x44],
        ["ani", 0xe6, 0x55],
        ["xri", 0xee, 0x66],
        ["ori", 0xf6, 0x77],
        ["cpi", 0xfe, 0x88],
    ];
    let src = "";
    const expected: number[] = [];
    for (const [mn, opcode, imm] of ops) {
        src += `${mn} ${imm.toString(16)}h\n`;
        expected.push(opcode, imm);
    }
    expect(bytes(src)).toEqual(expected);
});

// ---------------------------------------------------------------------------
// INR / DCR - all 8 registers each
// ---------------------------------------------------------------------------
test("INR - all registers", () => {
    let src = "";
    const expected: number[] = [];
    for (let i = 0; i < 8; i++) {
        src += `inr ${REGS[i]}\n`;
        expected.push(0x04 | (i << 3));
    }
    expect(bytes(src)).toEqual(expected);
});

test("DCR - all registers", () => {
    let src = "";
    const expected: number[] = [];
    for (let i = 0; i < 8; i++) {
        src += `dcr ${REGS[i]}\n`;
        expected.push(0x05 | (i << 3));
    }
    expect(bytes(src)).toEqual(expected);
});

// ---------------------------------------------------------------------------
// LXI - all 4 register pairs
// ---------------------------------------------------------------------------
test("LXI - all register pairs", () => {
    const pairs: [string, number, number][] = [
        ["b", 0, 0x1234],
        ["d", 1, 0x5678],
        ["h", 2, 0x9abc],
        ["sp", 3, 0xdef0],
    ];
    let src = "";
    const expected: number[] = [];
    for (const [name, rp, val] of pairs) {
        src += `lxi ${name}, 0${val.toString(16)}h\n`;
        expected.push(0x01 | (rp << 4), val & 0xff, (val >> 8) & 0xff);
    }
    expect(bytes(src)).toEqual(expected);
});

// ---------------------------------------------------------------------------
// DAD / INX / DCX - all 4 register pairs each
// ---------------------------------------------------------------------------
test("DAD - all register pairs", () => {
    const pairs = ["b", "d", "h", "sp"];
    let src = "";
    const expected: number[] = [];
    for (let i = 0; i < 4; i++) {
        src += `dad ${pairs[i]}\n`;
        expected.push(0x09 | (i << 4));
    }
    expect(bytes(src)).toEqual(expected);
});

test("INX - all register pairs", () => {
    const pairs = ["b", "d", "h", "sp"];
    let src = "";
    const expected: number[] = [];
    for (let i = 0; i < 4; i++) {
        src += `inx ${pairs[i]}\n`;
        expected.push(0x03 | (i << 4));
    }
    expect(bytes(src)).toEqual(expected);
});

test("DCX - all register pairs", () => {
    const pairs = ["b", "d", "h", "sp"];
    let src = "";
    const expected: number[] = [];
    for (let i = 0; i < 4; i++) {
        src += `dcx ${pairs[i]}\n`;
        expected.push(0x0b | (i << 4));
    }
    expect(bytes(src)).toEqual(expected);
});

// ---------------------------------------------------------------------------
// PUSH / POP - all 4 register pairs (B, D, H, PSW)
// ---------------------------------------------------------------------------
test("PUSH - all register pairs", () => {
    const pairs = ["b", "d", "h", "psw"];
    let src = "";
    const expected: number[] = [];
    for (let i = 0; i < 4; i++) {
        src += `push ${pairs[i]}\n`;
        expected.push(0xc5 | (i << 4));
    }
    expect(bytes(src)).toEqual(expected);
});

test("POP - all register pairs", () => {
    const pairs = ["b", "d", "h", "psw"];
    let src = "";
    const expected: number[] = [];
    for (let i = 0; i < 4; i++) {
        src += `pop ${pairs[i]}\n`;
        expected.push(0xc1 | (i << 4));
    }
    expect(bytes(src)).toEqual(expected);
});

// ---------------------------------------------------------------------------
// LDAX / STAX
// ---------------------------------------------------------------------------
test("LDAX / STAX", () => {
    expect(bytes("ldax b\nldax d\nstax b\nstax d")).toEqual([0x0a, 0x1a, 0x02, 0x12]);
});

// ---------------------------------------------------------------------------
// Unconditional & conditional jumps (9 instructions)
// ---------------------------------------------------------------------------
test("JMP and conditional jumps", () => {
    const ops: [string, number][] = [
        ["jmp", 0xc3],
        ["jnz", 0xc2],
        ["jz", 0xca],
        ["jnc", 0xd2],
        ["jc", 0xda],
        ["jpo", 0xe2],
        ["jpe", 0xea],
        ["jp", 0xf2],
        ["jm", 0xfa],
    ];
    let src = "";
    const expected: number[] = [];
    for (const [mn, opcode] of ops) {
        src += `${mn} 1234h\n`;
        expected.push(opcode, 0x34, 0x12);
    }
    expect(bytes(src)).toEqual(expected);
});

// ---------------------------------------------------------------------------
// Unconditional & conditional calls (9 instructions)
// ---------------------------------------------------------------------------
test("CALL and conditional calls", () => {
    const ops: [string, number][] = [
        ["call", 0xcd],
        ["cnz", 0xc4],
        ["cz", 0xcc],
        ["cnc", 0xd4],
        ["cc", 0xdc],
        ["cpo", 0xe4],
        ["cpe", 0xec],
        ["cp", 0xf4],
        ["cm", 0xfc],
    ];
    let src = "";
    const expected: number[] = [];
    for (const [mn, opcode] of ops) {
        src += `${mn} 0ABCDh\n`;
        expected.push(opcode, 0xcd, 0xab);
    }
    expect(bytes(src)).toEqual(expected);
});

// ---------------------------------------------------------------------------
// Direct memory: LDA, STA, LHLD, SHLD
// ---------------------------------------------------------------------------
test("LDA / STA / LHLD / SHLD", () => {
    const ops: [string, number][] = [
        ["lda", 0x3a],
        ["sta", 0x32],
        ["lhld", 0x2a],
        ["shld", 0x22],
    ];
    let src = "";
    const expected: number[] = [];
    for (const [mn, opcode] of ops) {
        src += `${mn} 5678h\n`;
        expected.push(opcode, 0x78, 0x56);
    }
    expect(bytes(src)).toEqual(expected);
});

// ---------------------------------------------------------------------------
// IN / OUT
// ---------------------------------------------------------------------------
test("IN / OUT", () => {
    expect(bytes("in 42h\nout 0FFh")).toEqual([0xdb, 0x42, 0xd3, 0xff]);
});

// ---------------------------------------------------------------------------
// RST 0-7
// ---------------------------------------------------------------------------
test("RST 0 through 7", () => {
    let src = "";
    const expected: number[] = [];
    for (let n = 0; n < 8; n++) {
        src += `rst ${n}\n`;
        expected.push(0xc7 | (n << 3));
    }
    expect(bytes(src)).toEqual(expected);
});

// ---------------------------------------------------------------------------
// Directives: DB, DW, EQU
// ---------------------------------------------------------------------------
describe("directives", () => {
    test("db - single byte", () => {
        expect(bytes("db 42h")).toEqual([0x42]);
    });

    test("db - multiple bytes", () => {
        expect(bytes("db 1, 2, 0Ah, 0FFh")).toEqual([0x01, 0x02, 0x0a, 0xff]);
    });

    test("db - string", () => {
        expect(bytes('db "ABC"')).toEqual([0x41, 0x42, 0x43]);
    });

    test("db - single-quoted string", () => {
        expect(bytes("db 'Hi'")).toEqual([0x48, 0x69]);
    });

    test("db - mixed bytes and string", () => {
        expect(bytes('db 1, "AB", 2')).toEqual([0x01, 0x41, 0x42, 0x02]);
    });

    test("dw - single word little-endian", () => {
        expect(bytes("dw 1234h")).toEqual([0x34, 0x12]);
    });

    test("dw - multiple words", () => {
        expect(bytes("dw 1234h, 0ABCDh")).toEqual([0x34, 0x12, 0xcd, 0xab]);
    });

    test("equ", () => {
        const s = asm("val equ 42h\norg 0\nmvi a, val\nend\n");
        expect(s[0].data).toEqual([0x3e, 0x42]);
    });

    test("equ referencing earlier equ", () => {
        const s = asm("base equ 1000h\ntop equ base + 100h\norg 0\nlxi h, top\nend\n");
        // top = 0x1100
        expect(s[0].data).toEqual([0x21, 0x00, 0x11]);
    });
});

// ---------------------------------------------------------------------------
// Expressions
// ---------------------------------------------------------------------------
describe("expressions", () => {
    test("addition", () => {
        const s = asm("base equ 1000h\norg 0\nlxi h, base + 10h\nend\n");
        expect(s[0].data).toEqual([0x21, 0x10, 0x10]);
    });

    test("subtraction", () => {
        const s = asm("base equ 1000h\norg 0\nlxi h, base - 1\nend\n");
        expect(s[0].data).toEqual([0x21, 0xff, 0x0f]);
    });

    test("chained arithmetic", () => {
        const s = asm("org 0\nlxi h, 100h + 20h - 5\nend\n");
        // 0x100 + 0x20 - 5 = 0x11B
        expect(s[0].data).toEqual([0x21, 0x1b, 0x01]);
    });

    test("16-bit wrap", () => {
        const s = asm("org 0\nlxi h, 0 - 1\nend\n");
        // 0 - 1 = 0xFFFF (16-bit)
        expect(s[0].data).toEqual([0x21, 0xff, 0xff]);
    });
});

// ---------------------------------------------------------------------------
// Labels and forward references
// ---------------------------------------------------------------------------
describe("labels", () => {
    test("forward reference", () => {
        const s = asm("org 0\njmp target\nnop\ntarget:\nnop\nend\n");
        // JMP to offset 4 (3 bytes JMP + 1 NOP), then two NOPs
        expect(s[0].data).toEqual([0xc3, 0x04, 0x00, 0x00, 0x00]);
    });

    test("backward reference", () => {
        const s = asm("org 0\nloop:\nnop\njmp loop\nend\n");
        // NOP at 0, JMP 0000h
        expect(s[0].data).toEqual([0x00, 0xc3, 0x00, 0x00]);
    });

    test("label on same line as instruction", () => {
        const s = asm("org 0\nstart: nop\nloop: jmp loop\nend\n");
        expect(s[0].data).toEqual([0x00, 0xc3, 0x01, 0x00]);
    });

    test("label with org offset", () => {
        const s = asm("org 8000h\njmp target\ntarget:\nnop\nend\n");
        // JMP 8003h
        expect(s[0].data).toEqual([0xc3, 0x03, 0x80, 0x00]);
    });
});

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------
test("multiple org creates multiple sections", () => {
    const s = asm("org 100h\nnop\norg 200h\nhlt\nend\n");
    expect(s).toHaveLength(2);
    expect(s[0]).toEqual({ start: 0x100, end: 0x100, data: [0x00] });
    expect(s[1]).toEqual({ start: 0x200, end: 0x200, data: [0x76] });
});

// ---------------------------------------------------------------------------
// Number formats
// ---------------------------------------------------------------------------
describe("number formats", () => {
    test("decimal", () => {
        expect(bytes("mvi a, 255")).toEqual([0x3e, 0xff]);
    });

    test("hex with h suffix", () => {
        expect(bytes("mvi a, 0FFh")).toEqual([0x3e, 0xff]);
    });

    test("hex starting with letter needs leading 0", () => {
        expect(bytes("mvi a, 0ABh")).toEqual([0x3e, 0xab]);
    });

    test("character literal as immediate", () => {
        expect(bytes("mvi a, 'A'")).toEqual([0x3e, 0x41]);
    });

    test("character literal in cpi", () => {
        expect(bytes("cpi 'X'")).toEqual([0xfe, 0x58]);
    });

    test("character literal in expression", () => {
        expect(bytes("mvi a, 'A' + 1")).toEqual([0x3e, 0x42]);
    });

    test("character literal space", () => {
        expect(bytes("mvi a, ' '")).toEqual([0x3e, 0x20]);
    });

    test("character literal in adi", () => {
        expect(bytes("adi '0'")).toEqual([0xc6, 0x30]);
    });
});

// ---------------------------------------------------------------------------
// Case insensitivity
// ---------------------------------------------------------------------------
test("case insensitive mnemonics and registers", () => {
    expect(bytes("NOP")).toEqual([0x00]);
    expect(bytes("Nop")).toEqual([0x00]);
    expect(bytes("MOV A, B")).toEqual([0x78]);
    expect(bytes("mov a, b")).toEqual([0x78]);
    expect(bytes("PUSH PSW")).toEqual([0xf5]);
    expect(bytes("push psw")).toEqual([0xf5]);
    expect(bytes("LXI SP, 0")).toEqual([0x31, 0x00, 0x00]);
});

// ---------------------------------------------------------------------------
// Comments and whitespace
// ---------------------------------------------------------------------------
describe("comments and whitespace", () => {
    test("comment-only line", () => {
        expect(bytes("; this is a comment\nnop")).toEqual([0x00]);
    });

    test("inline comment", () => {
        expect(bytes("nop ; do nothing")).toEqual([0x00]);
    });

    test("blank lines ignored", () => {
        expect(bytes("\n\nnop\n\n")).toEqual([0x00]);
    });

    test("comment with semicolon in db string", () => {
        expect(bytes('db "a;b"')).toEqual([0x61, 0x3b, 0x62]);
    });
});
