// asm8.ts - Intel 8080 two-pass assembler

export interface Section {
    start: number;
    end: number;
    data: number[];
}

const REG8: Record<string, number> = {
    B: 0,
    C: 1,
    D: 2,
    E: 3,
    H: 4,
    L: 5,
    M: 6,
    A: 7,
};

const REG_PAIR: Record<string, number> = {
    B: 0,
    D: 1,
    H: 2,
    SP: 3,
};

const REG_PAIR_PUSH: Record<string, number> = {
    B: 0,
    D: 1,
    H: 2,
    PSW: 3,
};

const IMPLIED: Record<string, number> = {
    NOP: 0x00,
    HLT: 0x76,
    RET: 0xc9,
    XCHG: 0xeb,
    EI: 0xfb,
    DI: 0xf3,
    CMA: 0x2f,
    STC: 0x37,
    CMC: 0x3f,
    DAA: 0x27,
    RLC: 0x07,
    RRC: 0x0f,
    RAL: 0x17,
    RAR: 0x1f,
    PCHL: 0xe9,
    SPHL: 0xf9,
    XTHL: 0xe3,
    RNZ: 0xc0,
    RZ: 0xc8,
    RNC: 0xd0,
    RC: 0xd8,
    RPO: 0xe0,
    RPE: 0xe8,
    RP: 0xf0,
    RM: 0xf8,
};

const ALU_REG: Record<string, number> = {
    ADD: 0x80,
    ADC: 0x88,
    SUB: 0x90,
    SBB: 0x98,
    ANA: 0xa0,
    XRA: 0xa8,
    ORA: 0xb0,
    CMP: 0xb8,
};

const ALU_IMM: Record<string, number> = {
    ADI: 0xc6,
    ACI: 0xce,
    SUI: 0xd6,
    SBI: 0xde,
    ANI: 0xe6,
    XRI: 0xee,
    ORI: 0xf6,
    CPI: 0xfe,
};

const ADDR16: Record<string, number> = {
    JMP: 0xc3,
    JNZ: 0xc2,
    JZ: 0xca,
    JNC: 0xd2,
    JC: 0xda,
    JPO: 0xe2,
    JPE: 0xea,
    JP: 0xf2,
    JM: 0xfa,
    CALL: 0xcd,
    CNZ: 0xc4,
    CZ: 0xcc,
    CNC: 0xd4,
    CC: 0xdc,
    CPO: 0xe4,
    CPE: 0xec,
    CP: 0xf4,
    CM: 0xfc,
    LDA: 0x3a,
    STA: 0x32,
    LHLD: 0x2a,
    SHLD: 0x22,
};

function instrSize(m: string): number {
    if (m in IMPLIED) return 1;
    if (m in ALU_REG) return 1;
    if (m === "MOV" || m === "INR" || m === "DCR") return 1;
    if (m === "PUSH" || m === "POP") return 1;
    if (m === "DAD" || m === "INX" || m === "DCX") return 1;
    if (m === "LDAX" || m === "STAX") return 1;
    if (m === "RST") return 1;
    if (m === "MVI") return 2;
    if (m in ALU_IMM) return 2;
    if (m === "IN" || m === "OUT") return 2;
    if (m === "LXI") return 3;
    if (m in ADDR16) return 3;
    throw new Error(`unknown mnemonic: ${m}`);
}

function stripComment(line: string): string {
    let inQ = false;
    let qc = "";
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (inQ) {
            if (c === qc) inQ = false;
        } else if (c === '"' || c === "'") {
            inQ = true;
            qc = c;
        } else if (c === ";") return line.slice(0, i);
    }
    return line;
}

function splitOperands(s: string): string[] {
    const r: string[] = [];
    let current = "";
    let inQ = false;
    let qc = "";
    for (const c of s) {
        if (inQ) {
            current += c;
            if (c === qc) inQ = false;
        } else if (c === '"' || c === "'") {
            inQ = true;
            qc = c;
            current += c;
        } else if (c === ",") {
            r.push(current.trim());
            current = "";
        } else current += c;
    }
    if (current.trim()) r.push(current.trim());
    return r;
}

interface ParsedLine {
    label?: string;
    mnemonic?: string;
    operands: string[];
    isEqu?: boolean;
}

function parseLine(line: string): ParsedLine {
    let s = stripComment(line).trim();
    if (!s) return { operands: [] };

    let label: string | undefined;
    const ci = s.indexOf(":");
    if (ci > 0 && /^[A-Za-z_]\w*$/.test(s.slice(0, ci).trim())) {
        label = s.slice(0, ci).trim();
        s = s.slice(ci + 1).trim();
    }
    if (!s) return { label, operands: [] };

    const si = s.search(/\s/);
    const first = si < 0 ? s : s.slice(0, si);
    const rest = si < 0 ? "" : s.slice(si).trim();

    if (!label && rest) {
        const parts = rest.split(/\s+/);
        if (parts[0].toUpperCase() === "EQU") {
            return {
                label: first,
                mnemonic: "EQU",
                operands: [parts.slice(1).join(" ")],
                isEqu: true,
            };
        }
    }

    return { label, mnemonic: first, operands: rest ? splitOperands(rest) : [] };
}

function evalAtom(s: string, symbols: Map<string, number>): number {
    s = s.trim();
    if (s.length === 3 && s[0] === "'" && s[2] === "'") return s.charCodeAt(1);
    if (/^[0-9][0-9A-Fa-f]*[hH]$/.test(s)) return parseInt(s.slice(0, -1), 16);
    if (/^[0-9]+$/.test(s)) return parseInt(s, 10);
    const k = s.toUpperCase();
    if (symbols.has(k)) return symbols.get(k)!;
    throw new Error(`unknown symbol: ${s}`);
}

function evalExpr(expr: string, symbols: Map<string, number>): number {
    expr = expr.trim();
    const tokens: string[] = [];
    const ops: string[] = ["+"];
    let current = "";
    for (const c of expr) {
        if ((c === "+" || c === "-") && current.trim()) {
            tokens.push(current.trim());
            ops.push(c);
            current = "";
        } else {
            current += c;
        }
    }
    if (current.trim()) tokens.push(current.trim());
    let r = 0;
    for (let i = 0; i < tokens.length; i++) {
        const v = evalAtom(tokens[i], symbols);
        r = ops[i] === "+" ? r + v : r - v;
    }
    return r & 0xffff;
}

function encode(m: string, ops: string[], symbols: Map<string, number>): number[] {
    if (m in IMPLIED) return [IMPLIED[m]];
    if (m in ALU_REG) return [ALU_REG[m] | REG8[ops[0].toUpperCase()]];
    if (m in ALU_IMM) return [ALU_IMM[m], evalExpr(ops[0], symbols) & 0xff];
    if (m in ADDR16) {
        const v = evalExpr(ops[0], symbols);
        return [ADDR16[m], v & 0xff, (v >> 8) & 0xff];
    }

    if (m === "MOV") return [0x40 | (REG8[ops[0].toUpperCase()] << 3) | REG8[ops[1].toUpperCase()]];
    if (m === "MVI") {
        const v = evalExpr(ops[1], symbols);
        return [0x06 | (REG8[ops[0].toUpperCase()] << 3), v & 0xff];
    }
    if (m === "INR") return [0x04 | (REG8[ops[0].toUpperCase()] << 3)];
    if (m === "DCR") return [0x05 | (REG8[ops[0].toUpperCase()] << 3)];
    if (m === "LXI") {
        const v = evalExpr(ops[1], symbols);
        return [0x01 | (REG_PAIR[ops[0].toUpperCase()] << 4), v & 0xff, (v >> 8) & 0xff];
    }
    if (m === "DAD") return [0x09 | (REG_PAIR[ops[0].toUpperCase()] << 4)];
    if (m === "INX") return [0x03 | (REG_PAIR[ops[0].toUpperCase()] << 4)];
    if (m === "DCX") return [0x0b | (REG_PAIR[ops[0].toUpperCase()] << 4)];
    if (m === "PUSH") return [0xc5 | (REG_PAIR_PUSH[ops[0].toUpperCase()] << 4)];
    if (m === "POP") return [0xc1 | (REG_PAIR_PUSH[ops[0].toUpperCase()] << 4)];
    if (m === "LDAX") return [0x0a | (REG_PAIR[ops[0].toUpperCase()] << 4)];
    if (m === "STAX") return [0x02 | (REG_PAIR[ops[0].toUpperCase()] << 4)];
    if (m === "IN") return [0xdb, evalExpr(ops[0], symbols) & 0xff];
    if (m === "OUT") return [0xd3, evalExpr(ops[0], symbols) & 0xff];
    if (m === "RST") {
        const n = evalExpr(ops[0], symbols);
        return [0xc7 | (n << 3)];
    }

    throw new Error(`cannot encode: ${m} ${ops.join(", ")}`);
}

function dbBytes(operands: string[], symbols: Map<string, number>): number[] {
    const out: number[] = [];
    for (const op of operands) {
        if ((op.startsWith('"') && op.endsWith('"')) || (op.startsWith("'") && op.endsWith("'"))) {
            for (const ch of op.slice(1, -1)) out.push(ch.charCodeAt(0));
        } else {
            out.push(evalExpr(op, symbols) & 0xff);
        }
    }
    return out;
}

function dwBytes(operands: string[], symbols: Map<string, number>): number[] {
    const out: number[] = [];
    for (const op of operands) {
        const v = evalExpr(op, symbols) & 0xffff;
        out.push(v & 0xff, (v >> 8) & 0xff);
    }
    return out;
}

function countDb(operands: string[]): number {
    let n = 0;
    for (const op of operands) {
        if ((op.startsWith('"') && op.endsWith('"')) || (op.startsWith("'") && op.endsWith("'"))) n += op.length - 2;
        else n++;
    }
    return n;
}

export function asm(source: string): Section[] {
    const lines = source.split("\n");
    const symbols = new Map<string, number>();

    // Pass 1: collect symbols
    let pc = 0;
    for (const line of lines) {
        const parts = parseLine(line);
        if (parts.label) {
            if (parts.isEqu) {
                symbols.set(parts.label.toUpperCase(), evalExpr(parts.operands[0], symbols));
                continue;
            }
            symbols.set(parts.label.toUpperCase(), pc);
        }
        if (!parts.mnemonic) continue;
        const m = parts.mnemonic.toUpperCase();
        if (m === "EQU") continue;
        if (m === "ORG") {
            pc = evalExpr(parts.operands[0], symbols);
            continue;
        }
        if (m === "END") break;
        if (m === "DB") {
            pc += countDb(parts.operands);
            continue;
        }
        if (m === "DW") {
            pc += parts.operands.length * 2;
            continue;
        }
        pc += instrSize(m);
    }

    // Pass 2: emit code
    const sections: Section[] = [];
    let current: Section | null = null;

    for (const line of lines) {
        const parts = parseLine(line);
        if (parts.isEqu || !parts.mnemonic) continue;
        const m = parts.mnemonic.toUpperCase();
        if (m === "EQU") continue;
        if (m === "ORG") {
            if (current && current.data.length) {
                current.end = current.start + current.data.length - 1;
                sections.push(current);
            }
            const addr = evalExpr(parts.operands[0], symbols);
            current = { start: addr, end: addr, data: [] };
            continue;
        }
        if (m === "END") break;
        if (!current) throw new Error("code before ORG");

        const bytes =
            m === "DB"
                ? dbBytes(parts.operands, symbols)
                : m === "DW"
                  ? dwBytes(parts.operands, symbols)
                  : encode(m, parts.operands, symbols);
        current.data.push(...bytes);
    }

    if (current && current.data.length) {
        current.end = current.start + current.data.length - 1;
        sections.push(current);
    }
    return sections;
}

// CLI driver
if (import.meta.main) {
    const args = process.argv.slice(2);
    const file = args.find((a) => !a.startsWith("--"));
    if (!file) {
        console.error("Usage: bun run asm8.ts <source.asm> [--one|--split]");
        process.exit(1);
    }

    const source = await Bun.file(file).text();
    const sections = asm(source);

    for (const s of sections) {
        const lo = s.start.toString(16).toUpperCase().padStart(4, "0");
        const hi = s.end.toString(16).toUpperCase().padStart(4, "0");
        console.log(`${lo}-${hi}  ${s.data.length} bytes`);
    }

    if (args.includes("--split")) {
        for (const s of sections) {
            const lo = s.start.toString(16).toUpperCase().padStart(4, "0");
            const hi = s.end.toString(16).toUpperCase().padStart(4, "0");
            await Bun.write(`${lo}-${hi}.bin`, new Uint8Array(s.data));
        }
    } else {
        const buf = new Uint8Array(65536);
        for (const s of sections) buf.set(s.data, s.start);
        await Bun.write("0000-FFFF.bin", buf);
    }
}
