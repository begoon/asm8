// asm8.ts - Intel 8080 two-pass assembler

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";

export interface Section {
  start: number;
  end: number;
  data: number[];
  name?: string;
}

export class AsmError extends Error {
  line: number;
  column: number;
  source: string;
  constructor(message: string, line: number, source: string, column = 1) {
    super(message);
    this.name = "AsmError";
    this.line = line;
    this.source = source;
    this.column = column;
  }
}

function firstNonSpaceCol(s: string): number {
  const m = s.match(/\S/);
  return m ? (m.index ?? 0) + 1 : 1;
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

const ALL_MNEMONICS = new Set<string>([
  ...Object.keys(IMPLIED),
  ...Object.keys(ALU_REG),
  ...Object.keys(ALU_IMM),
  ...Object.keys(ADDR16),
  "MOV",
  "MVI",
  "INR",
  "DCR",
  "LXI",
  "DAD",
  "INX",
  "DCX",
  "PUSH",
  "POP",
  "LDAX",
  "STAX",
  "IN",
  "OUT",
  "RST",
  "DB",
  "DW",
  "DS",
  "ORG",
  "SECTION",
  "END",
  "EQU",
]);

const MAX_STATEMENTS_PER_LINE = 10;

function splitStatements(line: string): string[] {
  const src = stripComment(line);
  const out: string[] = [];
  let start = 0;
  let inQ = false;
  let qc = "";
  for (let i = 0; i + 2 < src.length; i++) {
    const c = src[i];
    if (inQ) {
      if (c === qc) inQ = false;
      continue;
    }
    if (c === '"' || c === "'") {
      inQ = true;
      qc = c;
      continue;
    }
    if (c !== " " || src[i + 1] !== "/" || src[i + 2] !== " ") continue;
    let j = i + 3;
    while (j < src.length && src[j] === " ") j++;
    let tokStart = j;
    if (src[j] === ".") j++;
    let tokEnd = j;
    while (tokEnd < src.length && /\w/.test(src[tokEnd])) tokEnd++;
    if (tokEnd === j) continue;
    let tok = src.slice(tokStart, tokEnd).toUpperCase();
    if (tok.startsWith(".")) tok = tok.slice(1);
    if (!ALL_MNEMONICS.has(tok)) continue;
    out.push(src.slice(start, i));
    start = i + 2;
    i += 2;
  }
  out.push(src.slice(start));
  if (out.length > MAX_STATEMENTS_PER_LINE) {
    throw new Error(
      `too many statements on one line (max ${MAX_STATEMENTS_PER_LINE})`,
    );
  }
  return out;
}

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

const DIRECTIVES = new Set(["ORG", "SECTION", "END", "DB", "DW", "DS", "EQU"]);

function stripDirectiveDot(s: string): string {
  if (s.startsWith(".") && DIRECTIVES.has(s.slice(1).toUpperCase())) {
    return s.slice(1);
  }
  return s;
}

function parseLine(line: string): ParsedLine {
  let s = stripComment(line).trim();
  if (!s) return { operands: [] };

  let label: string | undefined;
  const ci = s.indexOf(":");
  if (ci > 0 && /^(?:[A-Za-z_]\w*|@\w+|\.\w+)$/.test(s.slice(0, ci).trim())) {
    label = s.slice(0, ci).trim();
    s = s.slice(ci + 1).trim();
  }
  if (!s) return { label, operands: [] };

  const si = s.search(/\s/);
  const first = si < 0 ? s : s.slice(0, si);
  const rest = si < 0 ? "" : s.slice(si).trim();

  if (!label && rest) {
    const parts = rest.split(/\s+/);
    if (stripDirectiveDot(parts[0]).toUpperCase() === "EQU") {
      return {
        label: first,
        mnemonic: "EQU",
        operands: [parts.slice(1).join(" ")],
        isEqu: true,
      };
    }
  }

  return {
    label,
    mnemonic: stripDirectiveDot(first),
    operands: rest ? splitOperands(rest) : [],
  };
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
    if (c === "$") {
      tokens.push({ kind: "id", val: "$" });
      i++;
      continue;
    }
    if (c === "@") {
      let j = i + 1;
      while (j < expr.length && /\w/.test(expr[j])) j++;
      if (j === i + 1) throw new Error("expected identifier after '@'");
      tokens.push({ kind: "id", val: expr.slice(i, j) });
      i = j;
      continue;
    }
    if (c === ".") {
      let j = i + 1;
      while (j < expr.length && /\w/.test(expr[j])) j++;
      if (j === i + 1) throw new Error("expected identifier after '.'");
      tokens.push({ kind: "id", val: expr.slice(i, j) });
      i = j;
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

function evalExpr(
  expr: string,
  symbols: Map<string, number>,
  pc = 0,
  lastLabel = "",
): number {
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
      const raw = t.val as string;
      if (raw === "$") return pc;
      const upper = raw.toUpperCase();
      if (upper === "LOW" || upper === "HIGH") {
        if (!isOp("(")) throw new Error(`${upper} requires parentheses`);
        next();
        const v = parseOr();
        if (!isOp(")")) throw new Error("expected ')'");
        next();
        return upper === "LOW" ? v & 0xff : (v >> 8) & 0xff;
      }
      let name = raw;
      if (name.startsWith("@") || name.startsWith(".")) {
        if (!lastLabel) throw new Error(`local label without scope: ${raw}`);
        name = lastLabel + name;
      }
      const k = name.toUpperCase();
      if (symbols.has(k)) return symbols.get(k)!;
      throw new Error(`unknown symbol: ${raw}`);
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
  pc = 0,
  lastLabel = "",
): number[] {
  if (m in IMPLIED) return [IMPLIED[m]];
  if (m in ALU_REG) return [ALU_REG[m] | REG8[ops[0].toUpperCase()]];
  if (m in ALU_IMM)
    return [ALU_IMM[m], evalExpr(ops[0], symbols, pc, lastLabel) & 0xff];
  if (m in ADDR16) {
    const v = evalExpr(ops[0], symbols, pc, lastLabel);
    return [ADDR16[m], v & 0xff, (v >> 8) & 0xff];
  }

  if (m === "MOV")
    return [
      0x40 | (REG8[ops[0].toUpperCase()] << 3) | REG8[ops[1].toUpperCase()],
    ];
  if (m === "MVI") {
    const v = evalExpr(ops[1], symbols, pc, lastLabel);
    return [0x06 | (REG8[ops[0].toUpperCase()] << 3), v & 0xff];
  }
  if (m === "INR") return [0x04 | (REG8[ops[0].toUpperCase()] << 3)];
  if (m === "DCR") return [0x05 | (REG8[ops[0].toUpperCase()] << 3)];
  if (m === "LXI") {
    const v = evalExpr(ops[1], symbols, pc, lastLabel);
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
  if (m === "IN")
    return [0xdb, evalExpr(ops[0], symbols, pc, lastLabel) & 0xff];
  if (m === "OUT")
    return [0xd3, evalExpr(ops[0], symbols, pc, lastLabel) & 0xff];
  if (m === "RST") {
    const n = evalExpr(ops[0], symbols, pc, lastLabel);
    return [0xc7 | (n << 3)];
  }

  throw new Error(`cannot encode: ${m} ${ops.join(", ")}`);
}

function dbBytes(
  operands: string[],
  symbols: Map<string, number>,
  pc = 0,
  lastLabel = "",
): number[] {
  const out: number[] = [];
  for (const op of operands) {
    if (
      (op.startsWith('"') && op.endsWith('"')) ||
      (op.startsWith("'") && op.endsWith("'"))
    ) {
      for (const ch of op.slice(1, -1)) out.push(ch.charCodeAt(0));
    } else {
      out.push(evalExpr(op, symbols, pc, lastLabel) & 0xff);
    }
  }
  return out;
}

function dwBytes(
  operands: string[],
  symbols: Map<string, number>,
  pc = 0,
  lastLabel = "",
): number[] {
  const out: number[] = [];
  for (const op of operands) {
    const v = evalExpr(op, symbols, pc, lastLabel) & 0xffff;
    out.push(v & 0xff, (v >> 8) & 0xff);
  }
  return out;
}

function parseDs(operands: string[]): { count: string; fill: string } {
  if (operands.length !== 1)
    throw new Error("DS takes one operand: count [(fill)]");
  const m = operands[0].match(/^(.+?)\s+\((.+)\)\s*$/);
  if (m) return { count: m[1], fill: m[2] };
  return { count: operands[0], fill: "0" };
}

function dsBytes(
  operands: string[],
  symbols: Map<string, number>,
  pc = 0,
  lastLabel = "",
): number[] {
  const { count, fill } = parseDs(operands);
  const n = evalExpr(count, symbols, pc, lastLabel);
  const f = evalExpr(fill, symbols, pc, lastLabel) & 0xff;
  return new Array(n).fill(f);
}

function countDs(
  operands: string[],
  symbols: Map<string, number>,
  pc = 0,
  lastLabel = "",
): number {
  const { count } = parseDs(operands);
  return evalExpr(count, symbols, pc, lastLabel);
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
  let lastLabel = "";
  let ended = false;
  for (let idx = 0; idx < lines.length && !ended; idx++) {
    const line = lines[idx];
    try {
      for (const stmt of splitStatements(line)) {
        const parts = parseLine(stmt);
        if (parts.label) {
          let labelName = parts.label;
          if (labelName.startsWith("@") || labelName.startsWith(".")) {
            if (!lastLabel)
              throw new Error(
                `local label without preceding normal label: ${labelName}`,
              );
            labelName = lastLabel + labelName;
          } else if (!parts.isEqu) {
            lastLabel = parts.label;
          }
          if (parts.isEqu) {
            symbols.set(
              labelName.toUpperCase(),
              evalExpr(parts.operands[0], symbols, pc, lastLabel),
            );
            continue;
          }
          symbols.set(labelName.toUpperCase(), pc);
        }
        if (!parts.mnemonic) continue;
        const m = parts.mnemonic.toUpperCase();
        if (m === "EQU") continue;
        if (m === "ORG") {
          pc = evalExpr(parts.operands[0], symbols, pc, lastLabel);
          continue;
        }
        if (m === "SECTION") continue;
        if (m === "END") {
          ended = true;
          break;
        }
        if (m === "DB") {
          pc += countDb(parts.operands);
          continue;
        }
        if (m === "DW") {
          pc += parts.operands.length * 2;
          continue;
        }
        if (m === "DS") {
          pc += countDs(parts.operands, symbols, pc, lastLabel);
          continue;
        }
        pc += instrSize(m);
      }
    } catch (e) {
      if (e instanceof AsmError) throw e;
      throw new AsmError(
        (e as Error).message,
        idx + 1,
        line,
        firstNonSpaceCol(line),
      );
    }
  }

  // Pass 2: emit code
  const sections: Section[] = [];
  let current: Section | null = null;
  const sectionNames = new Set<string>();
  let lastLabel2 = "";

  let endedPass2 = false;
  for (let idx = 0; idx < lines.length && !endedPass2; idx++) {
    const line = lines[idx];
    try {
      for (const stmt of splitStatements(line)) {
        const parts = parseLine(stmt);
        if (
          parts.label &&
          !parts.label.startsWith("@") &&
          !parts.label.startsWith(".") &&
          !parts.isEqu
        ) {
          lastLabel2 = parts.label;
        }
        if (parts.isEqu || !parts.mnemonic) continue;
        const m = parts.mnemonic.toUpperCase();
        if (m === "EQU") continue;
        const curPc = current ? current.start + current.data.length : 0;
        if (m === "ORG") {
          if (current && current.data.length) {
            current.end = current.start + current.data.length - 1;
            sections.push(current);
          }
          const addr = evalExpr(parts.operands[0], symbols, curPc, lastLabel2);
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
        if (m === "END") {
          endedPass2 = true;
          break;
        }
        if (!current) throw new Error("code before ORG");

        const bytes =
          m === "DB"
            ? dbBytes(parts.operands, symbols, curPc, lastLabel2)
            : m === "DW"
              ? dwBytes(parts.operands, symbols, curPc, lastLabel2)
              : m === "DS"
                ? dsBytes(parts.operands, symbols, curPc, lastLabel2)
                : encode(m, parts.operands, symbols, curPc, lastLabel2);
        current.data.push(...bytes);
      }
    } catch (e) {
      if (e instanceof AsmError) throw e;
      throw new AsmError(
        (e as Error).message,
        idx + 1,
        line,
        firstNonSpaceCol(line),
      );
    }
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

function collectSymbols(lines: string[]): Map<string, number> {
  let symbols = new Map<string, number>();
  let pc = 0;
  let lastLabel = "";
  let ended = false;
  for (let idx = 0; idx < lines.length && !ended; idx++) {
    let line = lines[idx];
    try {
      for (const stmt of splitStatements(line)) {
        let parts = parseLine(stmt);
        if (parts.label) {
          let labelName = parts.label;
          if (labelName.startsWith("@") || labelName.startsWith(".")) {
            if (!lastLabel)
              throw new Error(
                `local label without preceding normal label: ${labelName}`,
              );
            labelName = lastLabel + labelName;
          } else if (!parts.isEqu) {
            lastLabel = parts.label;
          }
          if (parts.isEqu) {
            symbols.set(
              labelName.toUpperCase(),
              evalExpr(parts.operands[0], symbols, pc, lastLabel),
            );
            continue;
          }
          symbols.set(labelName.toUpperCase(), pc);
        }
        if (!parts.mnemonic) continue;
        let m = parts.mnemonic.toUpperCase();
        if (m === "EQU") continue;
        if (m === "ORG") {
          pc = evalExpr(parts.operands[0], symbols, pc, lastLabel);
          continue;
        }
        if (m === "SECTION") continue;
        if (m === "END") {
          ended = true;
          break;
        }
        if (m === "DB") {
          pc += countDb(parts.operands);
          continue;
        }
        if (m === "DW") {
          pc += parts.operands.length * 2;
          continue;
        }
        if (m === "DS") {
          pc += countDs(parts.operands, symbols, pc, lastLabel);
          continue;
        }
        pc += instrSize(m);
      }
    } catch (e) {
      if (e instanceof AsmError) throw e;
      throw new AsmError(
        (e as Error).message,
        idx + 1,
        line,
        firstNonSpaceCol(line),
      );
    }
  }
  return symbols;
}

export function symbolTable(source: string): string {
  let symbols = collectSymbols(source.split("\n"));
  let out: string[] = [];
  let sorted = [...symbols.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (let [name, val] of sorted) {
    out.push(`${name.padEnd(24)} ${hex4(val)}`);
  }
  return out.join("\n");
}

export function sectionMap(sections: Section[]): string {
  let out: string[] = [];
  let total = 0;
  let sorted = [...sections].sort((a, b) => a.start - b.start);
  for (const s of sorted) {
    let line = `${hex4(s.start)}-${hex4(s.end)}  ${String(s.data.length).padStart(5)} bytes`;
    if (s.name) line += `  ${s.name}`;
    out.push(line);
    total += s.data.length;
  }
  out.push("");
  out.push(
    `Total: ${total} bytes in ${sections.length} section${sections.length === 1 ? "" : "s"}`,
  );
  return out.join("\n");
}

export function listing(source: string): string {
  let lines = source.split("\n");
  let symbols = collectSymbols(lines);

  // Pass 2: generate listing
  let out: string[] = [];
  let pc = 0;
  let lastLabel = "";
  let done = false;

  for (let idx = 0; idx < lines.length; idx++) {
    let line = lines[idx];
    if (done) {
      out.push(fmtLst("", line));
      continue;
    }

    try {
      const statements = splitStatements(line);
      for (let si = 0; si < statements.length; si++) {
        const stmt = statements[si];
        const display = si === 0 ? line : "";
        let parts = parseLine(stmt);

        if (
          parts.label &&
          !parts.label.startsWith("@") &&
          !parts.label.startsWith(".") &&
          !parts.isEqu
        ) {
          lastLabel = parts.label;
        }

        if (parts.isEqu) {
          let val = evalExpr(parts.operands[0], symbols, pc, lastLabel);
          out.push(fmtLst("=" + hex4(val), display));
          continue;
        }

        if (!parts.mnemonic) {
          if (parts.label) {
            out.push(fmtLst(hex4(pc) + ":", display));
          } else if (si === 0) {
            out.push(fmtLst("", display));
          }
          continue;
        }

        let m = parts.mnemonic.toUpperCase();

        if (m === "ORG") {
          pc = evalExpr(parts.operands[0], symbols, pc, lastLabel);
          out.push(fmtLst(hex4(pc) + ":", display));
          continue;
        }

        if (m === "SECTION") {
          out.push(fmtLst("", display));
          continue;
        }

        if (m === "END") {
          out.push(fmtLst("", display));
          done = true;
          break;
        }

        if (m === "DS") {
          const n = countDs(parts.operands, symbols, pc, lastLabel);
          out.push(fmtLst(hex4(pc) + ":", display));
          pc += n;
          continue;
        }

        let bytes =
          m === "DB"
            ? dbBytes(parts.operands, symbols, pc, lastLabel)
            : m === "DW"
              ? dwBytes(parts.operands, symbols, pc, lastLabel)
              : encode(m, parts.operands, symbols, pc, lastLabel);

        for (let i = 0; i < bytes.length; i += 4) {
          let chunk = bytes.slice(i, i + 4);
          let prefix = hex4(pc + i) + ": " + chunk.map(hex2).join(" ");
          out.push(fmtLst(prefix, i === 0 ? display : ""));
        }
        if (bytes.length === 0) {
          out.push(fmtLst(hex4(pc) + ":", display));
        }
        pc += bytes.length;
      }
    } catch (e) {
      if (e instanceof AsmError) throw e;
      throw new AsmError(
        (e as Error).message,
        idx + 1,
        line,
        firstNonSpaceCol(line),
      );
    }
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

Usage: asm8080 <source.asm> [more.asm ...] [options]

Multiple input files are concatenated in argument order as if they were
one file; the first filename determines the output <base> name.

Options:
  --split    write each section as <base>-<name>.bin (or <base>-XXXX-XXXX.bin);
             if there is only one section, write <base>.bin
  -l         generate listing (.lst), symbol table (.sym), and section map (.map) files
  -o <dir>   output directory (default: current directory)
  -v         show version
  -h         show this help`);
    return;
  }

  let outDir = (arg(args, "-o") as string) ?? ".";
  mkdirSync(outDir, { recursive: true });

  let split = flag(args, "--split");
  let lst = flag(args, "-l");

  const files = args;
  if (files.length === 0) {
    console.error(
      "Usage: asm8080 <source.asm> [more.asm ...] [--split] [-l] [-o <dir>]",
    );
    process.exit(1);
  }
  const file = files[0];

  const source = files.map((f) => readFileSync(f, "utf-8")).join("\n");

  let sections: Section[];
  try {
    sections = asm(source);
  } catch (e) {
    if (e instanceof AsmError) {
      printAsmError(file, e);
      process.exit(1);
    }
    throw e;
  }

  for (const s of sections) {
    console.log(`${hex4(s.start)}-${hex4(s.end)}  ${s.data.length} bytes`);
  }

  let base = basename(file).replace(/\.[^.]+$/, "");

  if (split) {
    if (sections.length === 1) {
      let path = join(outDir, `${base}.bin`);
      writeFileSync(path, new Uint8Array(sections[0].data));
      console.log(path);
    } else {
      for (const s of sections) {
        let suffix = s.name ?? `${hex4(s.start)}-${hex4(s.end)}`;
        let path = join(outDir, `${base}-${suffix}.bin`);
        writeFileSync(path, new Uint8Array(s.data));
        console.log(path);
      }
    }
  } else if (sections.length > 0) {
    const sorted = [...sections].sort((a, b) => a.start - b.start);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].start <= sorted[i - 1].end) {
        console.error(
          `${file}: error: sections overlap: ` +
            `${hex4(sorted[i - 1].start)}-${hex4(sorted[i - 1].end)} and ` +
            `${hex4(sorted[i].start)}-${hex4(sorted[i].end)}`,
        );
        process.exit(1);
      }
    }
    const maxEnd = sorted[sorted.length - 1].end;
    const buf = new Uint8Array(maxEnd + 1);
    for (const s of sections) buf.set(s.data, s.start);
    let path = join(outDir, `${base}.bin`);
    writeFileSync(path, buf);
    console.log(path);
  }

  if (lst) {
    let base = basename(file).replace(/\.[^.]+$/, "");
    let lstPath = join(outDir, base + ".lst");
    let symPath = join(outDir, base + ".sym");
    let mapPath = join(outDir, base + ".map");
    try {
      writeFileSync(lstPath, listing(source) + "\n");
      writeFileSync(symPath, symbolTable(source) + "\n");
      writeFileSync(mapPath, sectionMap(sections) + "\n");
    } catch (e) {
      if (e instanceof AsmError) {
        printAsmError(file, e);
        process.exit(1);
      }
      throw e;
    }
    console.log(lstPath);
    console.log(symPath);
    console.log(mapPath);
  }
}

function printAsmError(file: string, e: AsmError) {
  console.error(`${file}:${e.line}:${e.column}: error: ${e.message}`);
  console.error(`  ${e.source}`);
  const caretPad = " ".repeat(e.column - 1);
  console.error(`  ${caretPad}^`);
}

if (import.meta.main) {
  cli();
}
