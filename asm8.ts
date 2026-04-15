// asm8.ts - Intel 8080 two-pass assembler

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";

export interface Section {
  start: number;
  end: number;
  data: number[];
  name?: string;
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

interface Token {
  kind: "num" | "id" | "op";
  val: string | number;
}

function tokenizeExpr(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    let c = expr[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === "'" && i + 2 < expr.length && expr[i + 2] === "'") {
      tokens.push({ kind: "num", val: expr.charCodeAt(i + 1) });
      i += 3;
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < expr.length && /[0-9A-Fa-f]/.test(expr[j])) j++;
      if (j < expr.length && /[hH]/.test(expr[j])) {
        tokens.push({ kind: "num", val: parseInt(expr.slice(i, j), 16) });
        j++;
      } else {
        tokens.push({ kind: "num", val: parseInt(expr.slice(i, j), 10) });
      }
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < expr.length && /\w/.test(expr[j])) j++;
      tokens.push({ kind: "id", val: expr.slice(i, j) });
      i = j;
      continue;
    }
    if (c === "<" && expr[i + 1] === "<") {
      tokens.push({ kind: "op", val: "<<" });
      i += 2;
      continue;
    }
    if (c === ">" && expr[i + 1] === ">") {
      tokens.push({ kind: "op", val: ">>" });
      i += 2;
      continue;
    }
    if ("+-*/%&|^~()".includes(c)) {
      tokens.push({ kind: "op", val: c });
      i++;
      continue;
    }
    throw new Error(`unexpected character in expression: '${c}'`);
  }
  return tokens;
}

function evalExpr(expr: string, symbols: Map<string, number>): number {
  const tokens = tokenizeExpr(expr);
  let pos = 0;

  function peek(): Token | undefined {
    return tokens[pos];
  }
  function next(): Token {
    return tokens[pos++];
  }
  function isOp(val: string): boolean {
    const t = peek();
    return t !== undefined && t.kind === "op" && t.val === val;
  }

  function atom(): number {
    const t = peek();
    if (!t) throw new Error("unexpected end of expression");
    if (t.kind === "num") {
      next();
      return t.val as number;
    }
    if (t.kind === "id") {
      next();
      const k = (t.val as string).toUpperCase();
      if (k === "LOW" || k === "HIGH") {
        if (!isOp("(")) throw new Error(`${k} requires parentheses`);
        next();
        const v = parseOr();
        if (!isOp(")")) throw new Error("expected ')'");
        next();
        return k === "LOW" ? v & 0xff : (v >> 8) & 0xff;
      }
      if (symbols.has(k)) return symbols.get(k)!;
      throw new Error(`unknown symbol: ${t.val}`);
    }
    if (t.kind === "op" && t.val === "(") {
      next();
      const v = parseOr();
      if (!isOp(")")) throw new Error("expected ')'");
      next();
      return v;
    }
    throw new Error(`unexpected token: ${t.val}`);
  }

  function unary(): number {
    if (isOp("-")) {
      next();
      return -unary() & 0xffff;
    }
    if (isOp("+")) {
      next();
      return unary();
    }
    if (isOp("~")) {
      next();
      return ~unary() & 0xffff;
    }
    return atom();
  }

  function multiplicative(): number {
    let v = unary();
    while (isOp("*") || isOp("/") || isOp("%")) {
      const op = next().val;
      let r = unary();
      if (op === "*") v = (v * r) & 0xffff;
      else if (op === "/") v = Math.trunc(v / r) & 0xffff;
      else v = (v % r) & 0xffff;
    }
    return v;
  }

  function additive(): number {
    let v = multiplicative();
    while (isOp("+") || isOp("-")) {
      const op = next().val;
      let r = multiplicative();
      v = op === "+" ? (v + r) & 0xffff : (v - r) & 0xffff;
    }
    return v;
  }

  function shift(): number {
    let v = additive();
    while (isOp("<<") || isOp(">>")) {
      const op = next().val;
      let r = additive();
      v = op === "<<" ? (v << r) & 0xffff : (v >>> r) & 0xffff;
    }
    return v;
  }

  function parseAnd(): number {
    let v = shift();
    while (isOp("&")) {
      next();
      v = v & shift();
    }
    return v;
  }

  function parseXor(): number {
    let v = parseAnd();
    while (isOp("^")) {
      next();
      v = (v ^ parseAnd()) & 0xffff;
    }
    return v;
  }

  function parseOr(): number {
    let v = parseXor();
    while (isOp("|")) {
      next();
      v = (v | parseXor()) & 0xffff;
    }
    return v;
  }

  const result = parseOr();
  if (pos < tokens.length)
    throw new Error(`unexpected token: ${tokens[pos].val}`);
  return result;
}

function encode(
  m: string,
  ops: string[],
  symbols: Map<string, number>,
): number[] {
  if (m in IMPLIED) return [IMPLIED[m]];
  if (m in ALU_REG) return [ALU_REG[m] | REG8[ops[0].toUpperCase()]];
  if (m in ALU_IMM) return [ALU_IMM[m], evalExpr(ops[0], symbols) & 0xff];
  if (m in ADDR16) {
    const v = evalExpr(ops[0], symbols);
    return [ADDR16[m], v & 0xff, (v >> 8) & 0xff];
  }

  if (m === "MOV")
    return [
      0x40 | (REG8[ops[0].toUpperCase()] << 3) | REG8[ops[1].toUpperCase()],
    ];
  if (m === "MVI") {
    const v = evalExpr(ops[1], symbols);
    return [0x06 | (REG8[ops[0].toUpperCase()] << 3), v & 0xff];
  }
  if (m === "INR") return [0x04 | (REG8[ops[0].toUpperCase()] << 3)];
  if (m === "DCR") return [0x05 | (REG8[ops[0].toUpperCase()] << 3)];
  if (m === "LXI") {
    const v = evalExpr(ops[1], symbols);
    return [
      0x01 | (REG_PAIR[ops[0].toUpperCase()] << 4),
      v & 0xff,
      (v >> 8) & 0xff,
    ];
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
    if (
      (op.startsWith('"') && op.endsWith('"')) ||
      (op.startsWith("'") && op.endsWith("'"))
    ) {
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
    if (
      (op.startsWith('"') && op.endsWith('"')) ||
      (op.startsWith("'") && op.endsWith("'"))
    )
      n += op.length - 2;
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
        symbols.set(
          parts.label.toUpperCase(),
          evalExpr(parts.operands[0], symbols),
        );
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
    if (m === "SECTION") continue;
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
  const sectionNames = new Set<string>();

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
    if (m === "SECTION") {
      if (!current) throw new Error("SECTION before ORG");
      const name = parts.operands[0];
      if (!name) throw new Error("SECTION requires a name");
      if (sectionNames.has(name.toUpperCase()))
        throw new Error(`duplicate section name: ${name}`);
      sectionNames.add(name.toUpperCase());
      current.name = name;
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

const LST_COL = 20;

function hex4(n: number): string {
  return n.toString(16).toUpperCase().padStart(4, "0");
}

function hex2(n: number): string {
  return n.toString(16).toUpperCase().padStart(2, "0");
}

function fmtLst(prefix: string, source: string): string {
  let padded = prefix
    ? prefix.padEnd(Math.max(LST_COL, prefix.length + 1))
    : "".padEnd(LST_COL);
  return (padded + source).trimEnd();
}

export function listing(source: string): string {
  let lines = source.split("\n");
  let symbols = new Map<string, number>();

  // Pass 1: collect symbols
  let pc = 0;
  for (let line of lines) {
    let parts = parseLine(line);
    if (parts.label) {
      if (parts.isEqu) {
        symbols.set(
          parts.label.toUpperCase(),
          evalExpr(parts.operands[0], symbols),
        );
        continue;
      }
      symbols.set(parts.label.toUpperCase(), pc);
    }
    if (!parts.mnemonic) continue;
    let m = parts.mnemonic.toUpperCase();
    if (m === "EQU") continue;
    if (m === "ORG") {
      pc = evalExpr(parts.operands[0], symbols);
      continue;
    }
    if (m === "SECTION") continue;
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

  // Pass 2: generate listing
  let out: string[] = [];
  pc = 0;
  let done = false;

  for (let line of lines) {
    if (done) {
      out.push(fmtLst("", line));
      continue;
    }

    let parts = parseLine(line);

    if (parts.isEqu) {
      let val = evalExpr(parts.operands[0], symbols);
      out.push(fmtLst("=" + hex4(val), line));
      continue;
    }

    if (!parts.mnemonic) {
      if (parts.label) {
        out.push(fmtLst(hex4(pc) + ":", line));
      } else {
        out.push(fmtLst("", line));
      }
      continue;
    }

    let m = parts.mnemonic.toUpperCase();

    if (m === "ORG") {
      pc = evalExpr(parts.operands[0], symbols);
      out.push(fmtLst(hex4(pc) + ":", line));
      continue;
    }

    if (m === "SECTION") {
      out.push(fmtLst("", line));
      continue;
    }

    if (m === "END") {
      out.push(fmtLst("", line));
      done = true;
      continue;
    }

    let bytes =
      m === "DB"
        ? dbBytes(parts.operands, symbols)
        : m === "DW"
          ? dwBytes(parts.operands, symbols)
          : encode(m, parts.operands, symbols);

    out.push(fmtLst(hex4(pc) + ": " + bytes.map(hex2).join(" "), line));
    pc += bytes.length;
  }

  // Symbol table
  out.push("");
  out.push("Symbol Table:");
  out.push("");
  let sorted = [...symbols.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (let [name, val] of sorted) {
    out.push(`${name.padEnd(24)} ${hex4(val)}`);
  }

  return out.join("\n");
}

function flag(args: string[], name: string): boolean {
  const i = args.indexOf(name);
  if (i == -1) return false;
  args.splice(i, 1);
  return true;
}

function arg<T>(
  args: string[],
  name: string,
  defaultValue?: string,
  matcher?: RegExp,
  convertor?: (value: string) => T,
): string | T | undefined {
  const convert = (v: string) => (convertor ? convertor(v) : v);
  const i = args.indexOf(name);
  if (i == -1) return undefined;
  if (i + 1 >= args.length || (matcher && !matcher.test(args[i + 1]))) {
    args.splice(i, 1);
    return defaultValue ? convert(defaultValue) : defaultValue;
  }
  const value = args[i + 1];
  args.splice(i, 2);
  return convert(value);
}

// CLI driver
export function cli() {
  const args = process.argv.slice(2);

  if (flag(args, "-v") || flag(args, "--version")) {
    let dir = dirname(import.meta.filename);
    for (let i = 0; i < 2; i++) {
      try {
        const pkg = JSON.parse(
          readFileSync(join(dir, "package.json"), "utf-8"),
        );
        console.log(pkg.version);
        return;
      } catch {
        dir = dirname(dir);
      }
    }
    return;
  }

  if (flag(args, "-h") || flag(args, "--help")) {
    console.log(`asm8080 - Intel 8080 two-pass assembler

Usage: asm8080 <source.asm> [options]

Options:
  --split    write each section as a separate file (name.bin or XXXX-XXXX.bin)
  -l         generate listing file (.lst)
  -o <dir>   output directory (default: current directory)
  -v         show version
  -h         show this help`);
    return;
  }

  let outDir = (arg(args, "-o") as string) ?? ".";
  mkdirSync(outDir, { recursive: true });

  let split = flag(args, "--split");
  let lst = flag(args, "-l");

  const file = args[0];
  if (!file) {
    console.error("Usage: asm8080 <source.asm> [--split] [-l] [-o <dir>]");
    process.exit(1);
  }

  const source = readFileSync(file, "utf-8");
  const sections = asm(source);

  for (const s of sections) {
    const lo = s.start.toString(16).toUpperCase().padStart(4, "0");
    const hi = s.end.toString(16).toUpperCase().padStart(4, "0");
    console.log(`${lo}-${hi}  ${s.data.length} bytes`);
  }

  if (split) {
    for (const s of sections) {
      let name: string;
      if (s.name) {
        name = s.name;
      } else {
        const lo = s.start.toString(16).toUpperCase().padStart(4, "0");
        const hi = s.end.toString(16).toUpperCase().padStart(4, "0");
        name = `${lo}-${hi}`;
      }
      writeFileSync(join(outDir, `${name}.bin`), new Uint8Array(s.data));
    }
  } else {
    const buf = new Uint8Array(65536);
    for (const s of sections) buf.set(s.data, s.start);
    writeFileSync(join(outDir, "0000-FFFF.bin"), buf);
  }

  if (lst) {
    let lstName = basename(file).replace(/\.[^.]+$/, "") + ".lst";
    let lstPath = join(outDir, lstName);
    writeFileSync(lstPath, listing(source) + "\n");
    console.log(lstPath);
  }
}

if (import.meta.main) {
  cli();
}
