// asm8.ts
var {readFileSync, writeFileSync, mkdirSync} = (() => ({}));

// node:path
function assertPath(path) {
  if (typeof path !== "string")
    throw TypeError("Path must be a string. Received " + JSON.stringify(path));
}
function normalizeStringPosix(path, allowAboveRoot) {
  var res = "", lastSegmentLength = 0, lastSlash = -1, dots = 0, code;
  for (var i = 0;i <= path.length; ++i) {
    if (i < path.length)
      code = path.charCodeAt(i);
    else if (code === 47)
      break;
    else
      code = 47;
    if (code === 47) {
      if (lastSlash === i - 1 || dots === 1)
        ;
      else if (lastSlash !== i - 1 && dots === 2) {
        if (res.length < 2 || lastSegmentLength !== 2 || res.charCodeAt(res.length - 1) !== 46 || res.charCodeAt(res.length - 2) !== 46) {
          if (res.length > 2) {
            var lastSlashIndex = res.lastIndexOf("/");
            if (lastSlashIndex !== res.length - 1) {
              if (lastSlashIndex === -1)
                res = "", lastSegmentLength = 0;
              else
                res = res.slice(0, lastSlashIndex), lastSegmentLength = res.length - 1 - res.lastIndexOf("/");
              lastSlash = i, dots = 0;
              continue;
            }
          } else if (res.length === 2 || res.length === 1) {
            res = "", lastSegmentLength = 0, lastSlash = i, dots = 0;
            continue;
          }
        }
        if (allowAboveRoot) {
          if (res.length > 0)
            res += "/..";
          else
            res = "..";
          lastSegmentLength = 2;
        }
      } else {
        if (res.length > 0)
          res += "/" + path.slice(lastSlash + 1, i);
        else
          res = path.slice(lastSlash + 1, i);
        lastSegmentLength = i - lastSlash - 1;
      }
      lastSlash = i, dots = 0;
    } else if (code === 46 && dots !== -1)
      ++dots;
    else
      dots = -1;
  }
  return res;
}
function _format(sep, pathObject) {
  var dir = pathObject.dir || pathObject.root, base = pathObject.base || (pathObject.name || "") + (pathObject.ext || "");
  if (!dir)
    return base;
  if (dir === pathObject.root)
    return dir + base;
  return dir + sep + base;
}
function resolve() {
  var resolvedPath = "", resolvedAbsolute = false, cwd;
  for (var i = arguments.length - 1;i >= -1 && !resolvedAbsolute; i--) {
    var path;
    if (i >= 0)
      path = arguments[i];
    else {
      if (cwd === undefined)
        cwd = process.cwd();
      path = cwd;
    }
    if (assertPath(path), path.length === 0)
      continue;
    resolvedPath = path + "/" + resolvedPath, resolvedAbsolute = path.charCodeAt(0) === 47;
  }
  if (resolvedPath = normalizeStringPosix(resolvedPath, !resolvedAbsolute), resolvedAbsolute)
    if (resolvedPath.length > 0)
      return "/" + resolvedPath;
    else
      return "/";
  else if (resolvedPath.length > 0)
    return resolvedPath;
  else
    return ".";
}
function normalize(path) {
  if (assertPath(path), path.length === 0)
    return ".";
  var isAbsolute = path.charCodeAt(0) === 47, trailingSeparator = path.charCodeAt(path.length - 1) === 47;
  if (path = normalizeStringPosix(path, !isAbsolute), path.length === 0 && !isAbsolute)
    path = ".";
  if (path.length > 0 && trailingSeparator)
    path += "/";
  if (isAbsolute)
    return "/" + path;
  return path;
}
function isAbsolute(path) {
  return assertPath(path), path.length > 0 && path.charCodeAt(0) === 47;
}
function join() {
  if (arguments.length === 0)
    return ".";
  var joined;
  for (var i = 0;i < arguments.length; ++i) {
    var arg = arguments[i];
    if (assertPath(arg), arg.length > 0)
      if (joined === undefined)
        joined = arg;
      else
        joined += "/" + arg;
  }
  if (joined === undefined)
    return ".";
  return normalize(joined);
}
function relative(from, to) {
  if (assertPath(from), assertPath(to), from === to)
    return "";
  if (from = resolve(from), to = resolve(to), from === to)
    return "";
  var fromStart = 1;
  for (;fromStart < from.length; ++fromStart)
    if (from.charCodeAt(fromStart) !== 47)
      break;
  var fromEnd = from.length, fromLen = fromEnd - fromStart, toStart = 1;
  for (;toStart < to.length; ++toStart)
    if (to.charCodeAt(toStart) !== 47)
      break;
  var toEnd = to.length, toLen = toEnd - toStart, length = fromLen < toLen ? fromLen : toLen, lastCommonSep = -1, i = 0;
  for (;i <= length; ++i) {
    if (i === length) {
      if (toLen > length) {
        if (to.charCodeAt(toStart + i) === 47)
          return to.slice(toStart + i + 1);
        else if (i === 0)
          return to.slice(toStart + i);
      } else if (fromLen > length) {
        if (from.charCodeAt(fromStart + i) === 47)
          lastCommonSep = i;
        else if (i === 0)
          lastCommonSep = 0;
      }
      break;
    }
    var fromCode = from.charCodeAt(fromStart + i), toCode = to.charCodeAt(toStart + i);
    if (fromCode !== toCode)
      break;
    else if (fromCode === 47)
      lastCommonSep = i;
  }
  var out = "";
  for (i = fromStart + lastCommonSep + 1;i <= fromEnd; ++i)
    if (i === fromEnd || from.charCodeAt(i) === 47)
      if (out.length === 0)
        out += "..";
      else
        out += "/..";
  if (out.length > 0)
    return out + to.slice(toStart + lastCommonSep);
  else {
    if (toStart += lastCommonSep, to.charCodeAt(toStart) === 47)
      ++toStart;
    return to.slice(toStart);
  }
}
function _makeLong(path) {
  return path;
}
function dirname(path) {
  if (assertPath(path), path.length === 0)
    return ".";
  var code = path.charCodeAt(0), hasRoot = code === 47, end = -1, matchedSlash = true;
  for (var i = path.length - 1;i >= 1; --i)
    if (code = path.charCodeAt(i), code === 47) {
      if (!matchedSlash) {
        end = i;
        break;
      }
    } else
      matchedSlash = false;
  if (end === -1)
    return hasRoot ? "/" : ".";
  if (hasRoot && end === 1)
    return "//";
  return path.slice(0, end);
}
function basename(path, ext) {
  if (ext !== undefined && typeof ext !== "string")
    throw TypeError('"ext" argument must be a string');
  assertPath(path);
  var start = 0, end = -1, matchedSlash = true, i;
  if (ext !== undefined && ext.length > 0 && ext.length <= path.length) {
    if (ext.length === path.length && ext === path)
      return "";
    var extIdx = ext.length - 1, firstNonSlashEnd = -1;
    for (i = path.length - 1;i >= 0; --i) {
      var code = path.charCodeAt(i);
      if (code === 47) {
        if (!matchedSlash) {
          start = i + 1;
          break;
        }
      } else {
        if (firstNonSlashEnd === -1)
          matchedSlash = false, firstNonSlashEnd = i + 1;
        if (extIdx >= 0)
          if (code === ext.charCodeAt(extIdx)) {
            if (--extIdx === -1)
              end = i;
          } else
            extIdx = -1, end = firstNonSlashEnd;
      }
    }
    if (start === end)
      end = firstNonSlashEnd;
    else if (end === -1)
      end = path.length;
    return path.slice(start, end);
  } else {
    for (i = path.length - 1;i >= 0; --i)
      if (path.charCodeAt(i) === 47) {
        if (!matchedSlash) {
          start = i + 1;
          break;
        }
      } else if (end === -1)
        matchedSlash = false, end = i + 1;
    if (end === -1)
      return "";
    return path.slice(start, end);
  }
}
function extname(path) {
  assertPath(path);
  var startDot = -1, startPart = 0, end = -1, matchedSlash = true, preDotState = 0;
  for (var i = path.length - 1;i >= 0; --i) {
    var code = path.charCodeAt(i);
    if (code === 47) {
      if (!matchedSlash) {
        startPart = i + 1;
        break;
      }
      continue;
    }
    if (end === -1)
      matchedSlash = false, end = i + 1;
    if (code === 46) {
      if (startDot === -1)
        startDot = i;
      else if (preDotState !== 1)
        preDotState = 1;
    } else if (startDot !== -1)
      preDotState = -1;
  }
  if (startDot === -1 || end === -1 || preDotState === 0 || preDotState === 1 && startDot === end - 1 && startDot === startPart + 1)
    return "";
  return path.slice(startDot, end);
}
function format(pathObject) {
  if (pathObject === null || typeof pathObject !== "object")
    throw TypeError('The "pathObject" argument must be of type Object. Received type ' + typeof pathObject);
  return _format("/", pathObject);
}
function parse(path) {
  assertPath(path);
  var ret = { root: "", dir: "", base: "", ext: "", name: "" };
  if (path.length === 0)
    return ret;
  var code = path.charCodeAt(0), isAbsolute2 = code === 47, start;
  if (isAbsolute2)
    ret.root = "/", start = 1;
  else
    start = 0;
  var startDot = -1, startPart = 0, end = -1, matchedSlash = true, i = path.length - 1, preDotState = 0;
  for (;i >= start; --i) {
    if (code = path.charCodeAt(i), code === 47) {
      if (!matchedSlash) {
        startPart = i + 1;
        break;
      }
      continue;
    }
    if (end === -1)
      matchedSlash = false, end = i + 1;
    if (code === 46) {
      if (startDot === -1)
        startDot = i;
      else if (preDotState !== 1)
        preDotState = 1;
    } else if (startDot !== -1)
      preDotState = -1;
  }
  if (startDot === -1 || end === -1 || preDotState === 0 || preDotState === 1 && startDot === end - 1 && startDot === startPart + 1) {
    if (end !== -1)
      if (startPart === 0 && isAbsolute2)
        ret.base = ret.name = path.slice(1, end);
      else
        ret.base = ret.name = path.slice(startPart, end);
  } else {
    if (startPart === 0 && isAbsolute2)
      ret.name = path.slice(1, startDot), ret.base = path.slice(1, end);
    else
      ret.name = path.slice(startPart, startDot), ret.base = path.slice(startPart, end);
    ret.ext = path.slice(startDot, end);
  }
  if (startPart > 0)
    ret.dir = path.slice(0, startPart - 1);
  else if (isAbsolute2)
    ret.dir = "/";
  return ret;
}
var sep = "/";
var delimiter = ":";
var posix = ((p) => (p.posix = p, p))({ resolve, normalize, isAbsolute, join, relative, _makeLong, dirname, basename, extname, format, parse, sep, delimiter, win32: null, posix: null });

// asm8.ts
class AsmError extends Error {
  line;
  column;
  source;
  constructor(message, line, source, column = 1) {
    super(message);
    this.name = "AsmError";
    this.line = line;
    this.source = source;
    this.column = column;
  }
}
function firstNonSpaceCol(s) {
  const m = s.match(/\S/);
  return m ? (m.index ?? 0) + 1 : 1;
}
var REG8 = {
  B: 0,
  C: 1,
  D: 2,
  E: 3,
  H: 4,
  L: 5,
  M: 6,
  A: 7
};
var REG_PAIR = {
  B: 0,
  D: 1,
  H: 2,
  SP: 3
};
var REG_PAIR_PUSH = {
  B: 0,
  D: 1,
  H: 2,
  PSW: 3
};
var IMPLIED = {
  NOP: 0,
  HLT: 118,
  RET: 201,
  XCHG: 235,
  EI: 251,
  DI: 243,
  CMA: 47,
  STC: 55,
  CMC: 63,
  DAA: 39,
  RLC: 7,
  RRC: 15,
  RAL: 23,
  RAR: 31,
  PCHL: 233,
  SPHL: 249,
  XTHL: 227,
  RNZ: 192,
  RZ: 200,
  RNC: 208,
  RC: 216,
  RPO: 224,
  RPE: 232,
  RP: 240,
  RM: 248
};
var ALU_REG = {
  ADD: 128,
  ADC: 136,
  SUB: 144,
  SBB: 152,
  ANA: 160,
  XRA: 168,
  ORA: 176,
  CMP: 184
};
var ALU_IMM = {
  ADI: 198,
  ACI: 206,
  SUI: 214,
  SBI: 222,
  ANI: 230,
  XRI: 238,
  ORI: 246,
  CPI: 254
};
var ADDR16 = {
  JMP: 195,
  JNZ: 194,
  JZ: 202,
  JNC: 210,
  JC: 218,
  JPO: 226,
  JPE: 234,
  JP: 242,
  JM: 250,
  CALL: 205,
  CNZ: 196,
  CZ: 204,
  CNC: 212,
  CC: 220,
  CPO: 228,
  CPE: 236,
  CP: 244,
  CM: 252,
  LDA: 58,
  STA: 50,
  LHLD: 42,
  SHLD: 34
};
var ALL_MNEMONICS = new Set([
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
  "EQU"
]);
var INVERT_JUMP = {
  Z: "JNZ",
  NZ: "JZ",
  C: "JNC",
  NC: "JC",
  PO: "JPE",
  PE: "JPO",
  P: "JM",
  M: "JP",
  "==": "JNZ",
  "<>": "JZ"
};
var VALID_PROC_REGS = new Set(["PSW", "B", "D", "H"]);
function popsAndRet(regs, orig) {
  const out = [];
  for (let k = regs.length - 1;k >= 0; k--) {
    out.push({ text: `	POP ${regs[k]}`, orig });
  }
  out.push({ text: `	RET`, orig });
  return out;
}
function preprocess(source) {
  const lines = source.split(`
`);
  const out = [];
  const stack = [];
  let counter = 0;
  let procCounter = 0;
  let proc = null;
  for (let i = 0;i < lines.length; i++) {
    const line = lines[i];
    const orig = i + 1;
    const bare = stripComment(line).trim();
    const ifMatch = bare.match(/^\.?if\s+(\S+)\s*$/i);
    if (ifMatch) {
      const cond = ifMatch[1].toUpperCase();
      const jmp = INVERT_JUMP[cond];
      if (!jmp) {
        throw new AsmError(`unknown .if condition: ${ifMatch[1]}`, orig, line, firstNonSpaceCol(line));
      }
      const id = counter++;
      stack.push({ id, sawElse: false, line: orig, source: line });
      out.push({ text: `	${jmp} @_if_${id}_else`, orig });
      continue;
    }
    if (/^\.?else\s*$/i.test(bare)) {
      const top = stack[stack.length - 1];
      if (!top) {
        throw new AsmError(".else without .if", orig, line, firstNonSpaceCol(line));
      }
      if (top.sawElse) {
        throw new AsmError("duplicate .else", orig, line, firstNonSpaceCol(line));
      }
      top.sawElse = true;
      out.push({ text: `	JMP @_if_${top.id}_exit`, orig });
      out.push({ text: `@_if_${top.id}_else:`, orig });
      continue;
    }
    if (/^\.?endif\s*$/i.test(bare)) {
      const top = stack.pop();
      if (!top) {
        throw new AsmError(".endif without .if", orig, line, firstNonSpaceCol(line));
      }
      const suffix = top.sawElse ? "exit" : "else";
      out.push({ text: `@_if_${top.id}_${suffix}:`, orig });
      continue;
    }
    const procMatch = bare.match(/^([A-Za-z_]\w*):?\s+\.?proc\b\s*(.*)$/i);
    if (procMatch && !ALL_MNEMONICS.has(procMatch[1].toUpperCase())) {
      if (proc) {
        throw new AsmError("nested .proc not allowed", orig, line, firstNonSpaceCol(line));
      }
      const name = procMatch[1];
      const regsRaw = procMatch[2].trim();
      const regs = [];
      if (regsRaw) {
        for (const r of regsRaw.split(/[,\s]+/)) {
          if (!r)
            continue;
          const up = r.toUpperCase();
          if (!VALID_PROC_REGS.has(up)) {
            throw new AsmError(`invalid .proc register: ${r} (expected PSW, B, D, or H)`, orig, line, firstNonSpaceCol(line));
          }
          regs.push(up);
        }
      }
      const id = procCounter++;
      proc = {
        regs,
        line: orig,
        source: line,
        exitLabel: `__proc_${id}_exit`,
        returnUsed: false
      };
      out.push({ text: `${name}:`, orig });
      for (const r of regs) {
        out.push({ text: `	PUSH ${r}`, orig });
      }
      continue;
    }
    if (/^\.proc(\s|$)/i.test(bare) || /^proc\s+\S/i.test(bare)) {
      throw new AsmError(".proc requires a label", orig, line, firstNonSpaceCol(line));
    }
    if (/^\.?endp\s*$/i.test(bare)) {
      if (!proc) {
        throw new AsmError(".endp without .proc", orig, line, firstNonSpaceCol(line));
      }
      if (proc.returnUsed) {
        out.push({ text: `${proc.exitLabel}:`, orig });
      }
      out.push(...popsAndRet(proc.regs, orig));
      proc = null;
      continue;
    }
    if (/^\.?return\s*$/i.test(bare)) {
      if (!proc) {
        throw new AsmError(".return outside .proc", orig, line, firstNonSpaceCol(line));
      }
      if (proc.regs.length === 0) {
        out.push({ text: `	RET`, orig });
      } else {
        proc.returnUsed = true;
        out.push({ text: `	JMP ${proc.exitLabel}`, orig });
      }
      continue;
    }
    out.push({ text: line, orig });
  }
  if (stack.length) {
    const top = stack[stack.length - 1];
    throw new AsmError(".if without .endif", top.line, top.source, firstNonSpaceCol(top.source));
  }
  if (proc) {
    throw new AsmError(".proc without .endp", proc.line, proc.source, firstNonSpaceCol(proc.source));
  }
  return out;
}
var MAX_STATEMENTS_PER_LINE = 10;
function splitStatements(line) {
  const src = stripComment(line);
  const out = [];
  let start = 0;
  let inQ = false;
  let qc = "";
  for (let i = 0;i + 2 < src.length; i++) {
    const c = src[i];
    if (inQ) {
      if (c === qc)
        inQ = false;
      continue;
    }
    if (c === '"' || c === "'") {
      inQ = true;
      qc = c;
      continue;
    }
    if (c !== " " || src[i + 1] !== "/" || src[i + 2] !== " ")
      continue;
    let j = i + 3;
    while (j < src.length && src[j] === " ")
      j++;
    let tokStart = j;
    if (src[j] === ".")
      j++;
    let tokEnd = j;
    while (tokEnd < src.length && /\w/.test(src[tokEnd]))
      tokEnd++;
    if (tokEnd === j)
      continue;
    let tok = src.slice(tokStart, tokEnd).toUpperCase();
    if (tok.startsWith("."))
      tok = tok.slice(1);
    if (!ALL_MNEMONICS.has(tok))
      continue;
    out.push(src.slice(start, i));
    start = i + 2;
    i += 2;
  }
  out.push(src.slice(start));
  if (out.length > MAX_STATEMENTS_PER_LINE) {
    throw new Error(`too many statements on one line (max ${MAX_STATEMENTS_PER_LINE})`);
  }
  return out;
}
function instrSize(m) {
  if (m in IMPLIED)
    return 1;
  if (m in ALU_REG)
    return 1;
  if (m === "MOV" || m === "INR" || m === "DCR")
    return 1;
  if (m === "PUSH" || m === "POP")
    return 1;
  if (m === "DAD" || m === "INX" || m === "DCX")
    return 1;
  if (m === "LDAX" || m === "STAX")
    return 1;
  if (m === "RST")
    return 1;
  if (m === "MVI")
    return 2;
  if (m in ALU_IMM)
    return 2;
  if (m === "IN" || m === "OUT")
    return 2;
  if (m === "LXI")
    return 3;
  if (m in ADDR16)
    return 3;
  throw new Error(`unknown mnemonic: ${m}`);
}
function stripComment(line) {
  let inQ = false;
  let qc = "";
  for (let i = 0;i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === qc)
        inQ = false;
    } else if (c === '"' || c === "'") {
      inQ = true;
      qc = c;
    } else if (c === ";")
      return line.slice(0, i);
  }
  return line;
}
function splitOperands(s) {
  const r = [];
  let current = "";
  let inQ = false;
  let qc = "";
  for (const c of s) {
    if (inQ) {
      current += c;
      if (c === qc)
        inQ = false;
    } else if (c === '"' || c === "'") {
      inQ = true;
      qc = c;
      current += c;
    } else if (c === ",") {
      r.push(current.trim());
      current = "";
    } else
      current += c;
  }
  if (current.trim())
    r.push(current.trim());
  return r;
}
var DIRECTIVES = new Set(["ORG", "SECTION", "END", "DB", "DW", "DS", "EQU"]);
function stripDirectiveDot(s) {
  if (s.startsWith(".") && DIRECTIVES.has(s.slice(1).toUpperCase())) {
    return s.slice(1);
  }
  return s;
}
var LABEL_RE = /^(?:[A-Za-z_]\w*|@\w+|\.\w+)$/;
function isMnemonic(tok) {
  return ALL_MNEMONICS.has(stripDirectiveDot(tok).toUpperCase());
}
function parseLine(line) {
  let s = stripComment(line).trim();
  if (!s)
    return { operands: [] };
  let label;
  const ci = s.indexOf(":");
  if (ci > 0 && LABEL_RE.test(s.slice(0, ci).trim())) {
    label = s.slice(0, ci).trim();
    s = s.slice(ci + 1).trim();
  }
  if (!s)
    return { label, operands: [] };
  let si = s.search(/\s/);
  let first = si < 0 ? s : s.slice(0, si);
  let rest = si < 0 ? "" : s.slice(si).trim();
  if (!label && rest && LABEL_RE.test(first) && !isMnemonic(first)) {
    const nextTok = rest.match(/^\S+/)?.[0] ?? "";
    if (isMnemonic(nextTok)) {
      label = first;
      si = rest.search(/\s/);
      first = si < 0 ? rest : rest.slice(0, si);
      rest = si < 0 ? "" : rest.slice(si).trim();
    }
  }
  const mnemonic = stripDirectiveDot(first);
  if (label && mnemonic.toUpperCase() === "EQU") {
    return {
      label,
      mnemonic: "EQU",
      operands: [rest],
      isEqu: true
    };
  }
  return {
    label,
    mnemonic,
    operands: rest ? splitOperands(rest) : []
  };
}
function tokenizeExpr(expr) {
  const tokens = [];
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
      while (j < expr.length && /\w/.test(expr[j]))
        j++;
      if (j === i + 1)
        throw new Error("expected identifier after '@'");
      tokens.push({ kind: "id", val: expr.slice(i, j) });
      i = j;
      continue;
    }
    if (c === ".") {
      let j = i + 1;
      while (j < expr.length && /\w/.test(expr[j]))
        j++;
      if (j === i + 1)
        throw new Error("expected identifier after '.'");
      tokens.push({ kind: "id", val: expr.slice(i, j) });
      i = j;
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < expr.length && /[0-9A-Fa-f]/.test(expr[j]))
        j++;
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
      while (j < expr.length && /\w/.test(expr[j]))
        j++;
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
function evalExpr(expr, symbols, pc = 0, lastLabel = "") {
  const tokens = tokenizeExpr(expr);
  let pos = 0;
  function peek() {
    return tokens[pos];
  }
  function next() {
    return tokens[pos++];
  }
  function isOp(val) {
    const t = peek();
    return t !== undefined && t.kind === "op" && t.val === val;
  }
  function atom() {
    const t = peek();
    if (!t)
      throw new Error("unexpected end of expression");
    if (t.kind === "num") {
      next();
      return t.val;
    }
    if (t.kind === "id") {
      next();
      const raw = t.val;
      if (raw === "$")
        return pc;
      const upper = raw.toUpperCase();
      if (upper === "LOW" || upper === "HIGH") {
        if (!isOp("("))
          throw new Error(`${upper} requires parentheses`);
        next();
        const v = parseOr();
        if (!isOp(")"))
          throw new Error("expected ')'");
        next();
        return upper === "LOW" ? v & 255 : v >> 8 & 255;
      }
      let name = raw;
      if (name.startsWith("@") || name.startsWith(".")) {
        if (!lastLabel)
          throw new Error(`local label without scope: ${raw}`);
        name = lastLabel + name;
      }
      const k = name.toUpperCase();
      if (symbols.has(k))
        return symbols.get(k);
      throw new Error(`unknown symbol: ${raw}`);
    }
    if (t.kind === "op" && t.val === "(") {
      next();
      const v = parseOr();
      if (!isOp(")"))
        throw new Error("expected ')'");
      next();
      return v;
    }
    throw new Error(`unexpected token: ${t.val}`);
  }
  function unary() {
    if (isOp("-")) {
      next();
      return -unary() & 65535;
    }
    if (isOp("+")) {
      next();
      return unary();
    }
    if (isOp("~")) {
      next();
      return ~unary() & 65535;
    }
    return atom();
  }
  function multiplicative() {
    let v = unary();
    while (isOp("*") || isOp("/") || isOp("%")) {
      const op = next().val;
      let r = unary();
      if (op === "*")
        v = v * r & 65535;
      else if (op === "/")
        v = Math.trunc(v / r) & 65535;
      else
        v = v % r & 65535;
    }
    return v;
  }
  function additive() {
    let v = multiplicative();
    while (isOp("+") || isOp("-")) {
      const op = next().val;
      let r = multiplicative();
      v = op === "+" ? v + r & 65535 : v - r & 65535;
    }
    return v;
  }
  function shift() {
    let v = additive();
    while (isOp("<<") || isOp(">>")) {
      const op = next().val;
      let r = additive();
      v = op === "<<" ? v << r & 65535 : v >>> r & 65535;
    }
    return v;
  }
  function parseAnd() {
    let v = shift();
    while (isOp("&")) {
      next();
      v = v & shift();
    }
    return v;
  }
  function parseXor() {
    let v = parseAnd();
    while (isOp("^")) {
      next();
      v = (v ^ parseAnd()) & 65535;
    }
    return v;
  }
  function parseOr() {
    let v = parseXor();
    while (isOp("|")) {
      next();
      v = (v | parseXor()) & 65535;
    }
    return v;
  }
  const result = parseOr();
  if (pos < tokens.length)
    throw new Error(`unexpected token: ${tokens[pos].val}`);
  return result;
}
function encode(m, ops, symbols, pc = 0, lastLabel = "") {
  if (m in IMPLIED)
    return [IMPLIED[m]];
  if (m in ALU_REG)
    return [ALU_REG[m] | REG8[ops[0].toUpperCase()]];
  if (m in ALU_IMM)
    return [ALU_IMM[m], evalExpr(ops[0], symbols, pc, lastLabel) & 255];
  if (m in ADDR16) {
    const v = evalExpr(ops[0], symbols, pc, lastLabel);
    return [ADDR16[m], v & 255, v >> 8 & 255];
  }
  if (m === "MOV")
    return [
      64 | REG8[ops[0].toUpperCase()] << 3 | REG8[ops[1].toUpperCase()]
    ];
  if (m === "MVI") {
    const v = evalExpr(ops[1], symbols, pc, lastLabel);
    return [6 | REG8[ops[0].toUpperCase()] << 3, v & 255];
  }
  if (m === "INR")
    return [4 | REG8[ops[0].toUpperCase()] << 3];
  if (m === "DCR")
    return [5 | REG8[ops[0].toUpperCase()] << 3];
  if (m === "LXI") {
    const v = evalExpr(ops[1], symbols, pc, lastLabel);
    return [
      1 | REG_PAIR[ops[0].toUpperCase()] << 4,
      v & 255,
      v >> 8 & 255
    ];
  }
  if (m === "DAD")
    return [9 | REG_PAIR[ops[0].toUpperCase()] << 4];
  if (m === "INX")
    return [3 | REG_PAIR[ops[0].toUpperCase()] << 4];
  if (m === "DCX")
    return [11 | REG_PAIR[ops[0].toUpperCase()] << 4];
  if (m === "PUSH")
    return [197 | REG_PAIR_PUSH[ops[0].toUpperCase()] << 4];
  if (m === "POP")
    return [193 | REG_PAIR_PUSH[ops[0].toUpperCase()] << 4];
  if (m === "LDAX")
    return [10 | REG_PAIR[ops[0].toUpperCase()] << 4];
  if (m === "STAX")
    return [2 | REG_PAIR[ops[0].toUpperCase()] << 4];
  if (m === "IN")
    return [219, evalExpr(ops[0], symbols, pc, lastLabel) & 255];
  if (m === "OUT")
    return [211, evalExpr(ops[0], symbols, pc, lastLabel) & 255];
  if (m === "RST") {
    const n = evalExpr(ops[0], symbols, pc, lastLabel);
    return [199 | n << 3];
  }
  throw new Error(`cannot encode: ${m} ${ops.join(", ")}`);
}
function dbBytes(operands, symbols, pc = 0, lastLabel = "") {
  const out = [];
  for (const op of operands) {
    if (op.startsWith('"') && op.endsWith('"') || op.startsWith("'") && op.endsWith("'")) {
      for (const ch of op.slice(1, -1))
        out.push(ch.charCodeAt(0));
    } else {
      out.push(evalExpr(op, symbols, pc, lastLabel) & 255);
    }
  }
  return out;
}
function dwBytes(operands, symbols, pc = 0, lastLabel = "") {
  const out = [];
  for (const op of operands) {
    const v = evalExpr(op, symbols, pc, lastLabel) & 65535;
    out.push(v & 255, v >> 8 & 255);
  }
  return out;
}
function parseDs(operands) {
  if (operands.length !== 1)
    throw new Error("DS takes one operand: count [(fill)]");
  const m = operands[0].match(/^(.+?)\s+\((.+)\)\s*$/);
  if (m)
    return { count: m[1], fill: m[2] };
  return { count: operands[0], fill: "0" };
}
function dsBytes(operands, symbols, pc = 0, lastLabel = "") {
  const { count, fill } = parseDs(operands);
  const n = evalExpr(count, symbols, pc, lastLabel);
  const f = evalExpr(fill, symbols, pc, lastLabel) & 255;
  return new Array(n).fill(f);
}
function countDs(operands, symbols, pc = 0, lastLabel = "") {
  const { count } = parseDs(operands);
  return evalExpr(count, symbols, pc, lastLabel);
}
function countDb(operands) {
  let n = 0;
  for (const op of operands) {
    if (op.startsWith('"') && op.endsWith('"') || op.startsWith("'") && op.endsWith("'"))
      n += op.length - 2;
    else
      n++;
  }
  return n;
}
function asm(source) {
  const pp = preprocess(source);
  const symbols = new Map;
  const pending = [];
  let pc = 0;
  let lastLabel = "";
  let ended = false;
  for (let idx = 0;idx < pp.length && !ended; idx++) {
    const { text: line, orig } = pp[idx];
    try {
      for (const stmt of splitStatements(line)) {
        const parts = parseLine(stmt);
        if (parts.label) {
          let labelName = parts.label;
          if (labelName.startsWith("@") || labelName.startsWith(".")) {
            if (!lastLabel)
              throw new Error(`local label without preceding normal label: ${labelName}`);
            labelName = lastLabel + labelName;
          } else if (!parts.isEqu) {
            lastLabel = parts.label;
          }
          if (parts.isEqu) {
            tryDefineEqu(symbols, pending, labelName, parts.operands[0], pc, lastLabel, orig, line);
            continue;
          }
          symbols.set(labelName.toUpperCase(), pc);
        }
        if (!parts.mnemonic)
          continue;
        const m = parts.mnemonic.toUpperCase();
        if (m === "EQU")
          continue;
        if (m === "ORG") {
          pc = evalExpr(parts.operands[0], symbols, pc, lastLabel);
          continue;
        }
        if (m === "SECTION")
          continue;
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
      if (e instanceof AsmError)
        throw e;
      throw new AsmError(e.message, orig, line, firstNonSpaceCol(line));
    }
  }
  resolvePendingEqus(symbols, pending);
  const sections = [];
  let current = null;
  const sectionNames = new Set;
  let lastLabel2 = "";
  let endedPass2 = false;
  for (let idx = 0;idx < pp.length && !endedPass2; idx++) {
    const { text: line, orig } = pp[idx];
    try {
      for (const stmt of splitStatements(line)) {
        const parts = parseLine(stmt);
        if (parts.label && !parts.label.startsWith("@") && !parts.label.startsWith(".") && !parts.isEqu) {
          lastLabel2 = parts.label;
        }
        if (parts.isEqu || !parts.mnemonic)
          continue;
        const m = parts.mnemonic.toUpperCase();
        if (m === "EQU")
          continue;
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
          if (!current)
            throw new Error("SECTION before ORG");
          const name = parts.operands[0];
          if (!name)
            throw new Error("SECTION requires a name");
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
        if (!current)
          throw new Error("code before ORG");
        const bytes = m === "DB" ? dbBytes(parts.operands, symbols, curPc, lastLabel2) : m === "DW" ? dwBytes(parts.operands, symbols, curPc, lastLabel2) : m === "DS" ? dsBytes(parts.operands, symbols, curPc, lastLabel2) : encode(m, parts.operands, symbols, curPc, lastLabel2);
        current.data.push(...bytes);
      }
    } catch (e) {
      if (e instanceof AsmError)
        throw e;
      throw new AsmError(e.message, orig, line, firstNonSpaceCol(line));
    }
  }
  if (current && current.data.length) {
    current.end = current.start + current.data.length - 1;
    sections.push(current);
  }
  return sections;
}
function hex4(n) {
  return n.toString(16).toUpperCase().padStart(4, "0");
}
function hex2(n) {
  return n.toString(16).toUpperCase().padStart(2, "0");
}
function isUnknownSymbolErr(e) {
  return e instanceof Error && /^unknown symbol:/.test(e.message);
}
function tryDefineEqu(symbols, pending, name, expr, pc, lastLabel, orig, line) {
  try {
    symbols.set(name.toUpperCase(), evalExpr(expr, symbols, pc, lastLabel));
  } catch (e) {
    if (isUnknownSymbolErr(e)) {
      pending.push({ name, expr, pc, lastLabel, orig, line });
    } else {
      throw e;
    }
  }
}
function resolvePendingEqus(symbols, pending) {
  while (pending.length > 0) {
    let progress = false;
    const next = [];
    for (const p of pending) {
      try {
        symbols.set(p.name.toUpperCase(), evalExpr(p.expr, symbols, p.pc, p.lastLabel));
        progress = true;
      } catch (e) {
        if (isUnknownSymbolErr(e)) {
          next.push(p);
        } else {
          throw new AsmError(e.message, p.orig, p.line, firstNonSpaceCol(p.line));
        }
      }
    }
    if (!progress) {
      const p = next[0];
      try {
        evalExpr(p.expr, symbols, p.pc, p.lastLabel);
      } catch (e) {
        throw new AsmError(e.message, p.orig, p.line, firstNonSpaceCol(p.line));
      }
      return;
    }
    pending.length = 0;
    pending.push(...next);
  }
}
function collectSymbols(pp) {
  let symbols = new Map;
  const pending = [];
  let pc = 0;
  let lastLabel = "";
  let ended = false;
  for (let idx = 0;idx < pp.length && !ended; idx++) {
    let { text: line, orig } = pp[idx];
    try {
      for (const stmt of splitStatements(line)) {
        let parts = parseLine(stmt);
        if (parts.label) {
          let labelName = parts.label;
          if (labelName.startsWith("@") || labelName.startsWith(".")) {
            if (!lastLabel)
              throw new Error(`local label without preceding normal label: ${labelName}`);
            labelName = lastLabel + labelName;
          } else if (!parts.isEqu) {
            lastLabel = parts.label;
          }
          if (parts.isEqu) {
            tryDefineEqu(symbols, pending, labelName, parts.operands[0], pc, lastLabel, orig, line);
            continue;
          }
          symbols.set(labelName.toUpperCase(), pc);
        }
        if (!parts.mnemonic)
          continue;
        let m = parts.mnemonic.toUpperCase();
        if (m === "EQU")
          continue;
        if (m === "ORG") {
          pc = evalExpr(parts.operands[0], symbols, pc, lastLabel);
          continue;
        }
        if (m === "SECTION")
          continue;
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
      if (e instanceof AsmError)
        throw e;
      throw new AsmError(e.message, orig, line, firstNonSpaceCol(line));
    }
  }
  resolvePendingEqus(symbols, pending);
  return symbols;
}
function lineInfo(source) {
  let pp = preprocess(source);
  let symbols = collectSymbols(pp);
  let out = [];
  let pc = 0;
  let lastLabel = "";
  let done = false;
  for (let idx = 0;idx < pp.length; idx++) {
    let { text: line, orig } = pp[idx];
    if (done) {
      out.push({ orig, prefix: "", display: line, bytes: [] });
      continue;
    }
    try {
      const statements = splitStatements(line);
      for (let si = 0;si < statements.length; si++) {
        const stmt = statements[si];
        const display = si === 0 ? line : "";
        let parts = parseLine(stmt);
        if (parts.label && !parts.label.startsWith("@") && !parts.label.startsWith(".") && !parts.isEqu) {
          lastLabel = parts.label;
        }
        if (parts.isEqu) {
          let val = evalExpr(parts.operands[0], symbols, pc, lastLabel);
          out.push({ orig, prefix: "=" + hex4(val), display, bytes: [] });
          continue;
        }
        if (!parts.mnemonic) {
          if (parts.label) {
            out.push({
              orig,
              prefix: hex4(pc) + ":",
              display,
              addr: pc,
              bytes: []
            });
          } else if (si === 0) {
            out.push({ orig, prefix: "", display, bytes: [] });
          }
          continue;
        }
        let m = parts.mnemonic.toUpperCase();
        if (m === "ORG") {
          pc = evalExpr(parts.operands[0], symbols, pc, lastLabel);
          out.push({
            orig,
            prefix: hex4(pc) + ":",
            display,
            addr: pc,
            bytes: []
          });
          continue;
        }
        if (m === "SECTION") {
          out.push({ orig, prefix: "", display, bytes: [] });
          continue;
        }
        if (m === "END") {
          out.push({ orig, prefix: "", display, bytes: [] });
          done = true;
          break;
        }
        if (m === "DS") {
          const n = countDs(parts.operands, symbols, pc, lastLabel);
          out.push({
            orig,
            prefix: hex4(pc) + ":",
            display,
            addr: pc,
            bytes: []
          });
          pc += n;
          continue;
        }
        let bytes = m === "DB" ? dbBytes(parts.operands, symbols, pc, lastLabel) : m === "DW" ? dwBytes(parts.operands, symbols, pc, lastLabel) : encode(m, parts.operands, symbols, pc, lastLabel);
        for (let i = 0;i < bytes.length; i += 4) {
          let chunk = bytes.slice(i, i + 4);
          let prefix = hex4(pc + i) + ": " + chunk.map(hex2).join(" ");
          out.push({
            orig,
            prefix,
            display: i === 0 ? display : "",
            addr: pc + i,
            bytes: chunk
          });
        }
        if (bytes.length === 0) {
          out.push({
            orig,
            prefix: hex4(pc) + ":",
            display,
            addr: pc,
            bytes: []
          });
        }
        pc += bytes.length;
      }
    } catch (e) {
      if (e instanceof AsmError)
        throw e;
      throw new AsmError(e.message, orig, line, firstNonSpaceCol(line));
    }
  }
  return out;
}
if (false) {}

// docs/examples/hello.asm
var hello_default = `; edit the source - bytes and addresses appear on the left.
; any error is shown at the bottom and highlights its line.

    org 0100h

start:
    lxi h, msg
    call print
    jmp 0f86ch

print:
    mov a, m
    cpi 0
    rz
    mov c, a
    call 0f809h
    inx h
    jmp print

msg:
    db "hello, world", 0
`;

// docs/examples/sections.asm
var sections_default = `; each \`org\` starts a new section.
; \`section "name"\` names the current section (must follow org).

    org 0100h
    section "code"
start:
    lxi h, greeting
    call 0f818h        ; puts
    jmp 0f86ch

    org 0200h
    section "msg"
greeting:
    db "HELLO FROM ANOTHER SECTION", 0
`;

// docs/examples/expressions.asm
var expressions_default = `; C-precedence expressions with LOW/HIGH, |, &, ^, ~, <<, >>, %.

BASE    equ 0F800h
WIDTH   equ 40
HEIGHT  equ 25
SIZE    equ WIDTH * HEIGHT
MASK    equ (1 << 7) - 1

    org 0100h

start:
    mvi a, LOW(BASE + 5)       ; a = 05h
    mvi b, HIGH(BASE + 5)      ; b = F8h
    lxi h, BASE | 00FFh        ; hl = F8FFh
    lxi d, SIZE                ; de = 1000 = 3E8h
    mvi c, MASK & 0F0h         ; c  = 70h
    ani (1 << 3) - 1           ; a &= 7
    sui SIZE % 256             ; a -= 232 (wraps)
    call 0f815h                ; print A as hex
    jmp 0f86ch
`;

// docs/examples/addr.asm
var addr_default = `; \`$\` evaluates to the address of the current instruction/directive.

    org 0100h

start:
    mvi a, length              ; A = 8  (computed from $ below)
    call 0f815h                ; print length in hex
    mvi a, low_of_here         ; A = low byte of \`here\`'s address
    call 0f815h
    jmp 0f86ch

start_of_data:
    db 1, 2, 3, 4, 5, 6, 7, 8
length equ $ - start_of_data   ; $ here = end of db block

here:
low_of_here equ $ & 0FFh       ; $ captured at the address of \`here\`
`;

// docs/examples/locals.asm
var locals_default = `; @name / .name are scoped to the most recent non-local label.
; same name can be reused under different parents.

    org 0100h

start:
    lxi h, word
    call strlen                ; B = length
    mov a, b
    call 0f815h                ; print length in hex
    jmp 0f86ch

; classic @-style locals
strlen:
    mvi b, 0
@loop:
    mov a, m
    cpi 0
    jz @done
    inr b
    inx h
    jmp @loop
@done:
    ret

; dotted locals — the leading colon is required when standalone
strcmp:
    .loop:
        ldax d
        cmp m
        jnz .diff
        ora a
        rz
        inx h
        inx d
        jmp .loop
    .diff:
        mvi a, 1
        ret

word:
    db "ABCDE", 0
`;

// docs/examples/ifelse.asm
var ifelse_default = `; .if <flag> skips the body when flag is false.
; flags: Z NZ C NC PO PE P M   aliases: ==  <>

    org 0100h

start:
    mvi a, 15                  ; try 3 / 12 / 42 and re-assemble
    call classify              ; B = class (1/2/3)
    mov a, b
    call 0f815h                ; print class in hex
    jmp 0f86ch

; classify A as <10 / 10..19 / >=20  (unsigned)
classify:
    cpi 10
    .if C
        mvi b, 1                ; A < 10
    .else
        cpi 20
        .if C
            mvi b, 2            ; 10 <= A < 20
        .else
            mvi b, 3            ; A >= 20
        .endif
    .endif
    ret
`;

// docs/examples/ok.asm
var ok_default = `; tiny RK86 program: prints "OK" via ROM routines.
; click "run" in the toolbar to launch it in the rk86.ru emulator.
;   F818h  puts string at HL (zero-terminated)
;   F86Ch  monitor entry

    .org 0
    .section ok

    lxi h, ok
    call 0f818h
    jmp 0f86ch

ok: db "OK", 0
`;

// docs/examples/proc.asm
var proc_default = `; <name> .proc [PSW, B, D, H]  -- auto-saves and restores listed pairs.
; .endp emits the pops + RET.   .return = same, for early exit.

    org 0100h

start:
    lxi h, buf
    call strlen                ; B = length
    mov a, b
    call 0f815h                ; print as hex
    jmp 0f86ch

; preserves PSW and HL; returns length in B
strlen .proc psw, h
    mvi b, 0
@loop:
    mov a, m
    cpi 0
    .if Z
        .return                 ; pops H then PSW, then RET
    .endif
    inr b
    inx h
    jmp @loop
.endp

buf:
    db "HELLO, WORLD", 0
`;

// docs/examples/proc-ret.asm
var proc_ret_default = `; with no register list, .proc has no pushes and no pops to emit,
; so .return compiles to a bare RET (1 byte).

    org 0100h

start:
    lxi h, zero
    call is_zero               ; A = 1 if *HL == 0 else 0
    call 0f815h                ; print A as hex
    jmp 0f86ch

; returns A = 1 when byte at HL is zero, else A = 0
is_zero .proc
    mov a, m
    cpi 0
    .if Z
        mvi a, 1
        .return                 ; -> RET (C9)
    .endif
    mvi a, 0
.endp

zero: db 0
`;

// docs/examples/proc-jmp.asm
var proc_jmp_default = `; when .proc lists registers, .return compiles to
;     JMP __proc_N_exit
; and .endp emits the shared label + POPs + RET at the bottom.

    org 0100h

start:
    lxi h, nonzero
    call is_zero
    call 0f815h                ; print A as hex
    jmp 0f86ch

; preserves B and HL; sets A = 1 if *HL == 0 else A = 0
is_zero .proc b, h
    mvi b, 0                    ; scratch that must be preserved
    mov a, m
    cpi 0
    .if Z
        mvi a, 1
        .return                 ; -> JMP __proc_0_exit
    .endif
    mvi a, 0
.endp                           ; __proc_0_exit: POP H, POP B, RET

nonzero: db 42
`;

// sokoban.asm
var sokoban_default = `; Sokoban/Pusher
; --------------
; A clone of the old DOS game called "pusher.exe".
; Copyright (c) 2012 by Alexander Demin
;
; Note: The implementation isn't quite portable because it uses the RK86
;       Monitor variable at 7600h containing the address of the cursor
;       position in video memory.

monitor_puthex    equ 0f815h   ; Print A in hex.
monitor_putchar   equ 0f809h   ; Print C as a character.
monitor_putstr    equ 0f818h   ; Print 0-terminated string from HL.
monitor_inkey     equ 0f803h   ; Input a key to A.
monitor_warm_exit equ 0f86ch

monitor32_cursor_addr equ 7600h

  org 0h

  lxi sp, 4000h               ; A "far away" value.
  xra a
  sta level

selector_cls:
  mvi c, 1fh
  call monitor_putchar

  lxi h, copyright_msg
  call monitor_putstr

selector:
  lxi h, number_of_maze_msg
  call monitor_putstr
  lda level
  inr a
  call print_dec
  call monitor_inkey
  cpi 8
  jz prev
  cpi 18h
  jz next
  cpi ' '
  jz game
  cpi '.'
  jz monitor_warm_exit
  jmp selector

prev:
  lxi h, level
  dcr m
  jp selector
  mvi m, 59
  jmp selector

next:
  lxi h, level
  inr m
  mvi a, 59
  cmp m
  jp selector
  mvi m, 0
  jmp selector

level:
  db 0

game:
  lda level
  call print_level
game_inkey:
  call check_barrels
  ora a
  jz end_game
  call monitor_inkey
  lxi d, 0ffffh   ; -1
  cpi 8
  jz move
  lxi d, 1
  cpi 18h
  jz move
  lxi d, 0ffb2h   ; -4eh 
  cpi 19h
  jz move
  lxi d, 4eh
  cpi 1ah
  jz move
  cpi ' '
  jz selector_cls
  jmp game_inkey

end_game:
  lhld player_addr
  mvi m, ' '
  call monitor_inkey
  lxi h, congratulations_msg
  call monitor_putstr
  call monitor_inkey
  mvi c, 1fh
  call monitor_putchar
  jmp next

move:
  lhld player_addr
  dad d
  mov a, m
  cpi ' '
  jz go_ahead
  cpi '.'
  jz go_ahead
  cpi '*'
  jz barrel_ahead
  cpi '&'
  jz barrel_ahead
  jmp game_inkey

go_ahead:
  lhld player_addr
  mvi m, ' '
  dad d
  mvi m, 9
  shld player_addr
  jmp game_inkey

barrel_ahead:
  dad d
  mov a, m
  cpi ' '
  mvi b, '*'
  jz shift_barrel
  cpi '.'
  mvi b, '&'
  jz shift_barrel
  jmp game_inkey

shift_barrel:
  lhld player_addr
  mvi m, ' '
  dad d
  shld player_addr
  mvi m, 9
  dad d
  mov m, b         ; '*' or '&'
  jmp game_inkey

print_level:
  push psw
  push b
  push d
  push h

  mvi c, 1fh
  call monitor_putchar

  push psw
  xra a
  sta barrel_count
  lxi h, barrels
  shld current_barrel
  pop psw

  mov l, a
  mvi h, 0
  dad h
  lxi d, levels
  dad d

  mov a, m
  inx h
  mov h, m
  mov l, a

  mov e, m
  mvi a, 64
  sub e
  ora a
  rar
  sta offset_x

  inx h
  mov d, m
  mvi a, 25
  sub d
  ora a
  rar
  sta offset_y

  push h
  lhld offset_xy
  shld player_xy
  pop h

  mov b, e
  mvi c, 0                             ; The initial repeat counter is 0.
  mvi a, 01h                   
  sta extract_bit_mask                 ; The initial bit mask is 0x01.

print_level_height_loop:
  push h
  lhld offset_xy
  call set_cursor
  inr l
  shld offset_xy
  pop h

print_level_width_loop:
  call extract_byte
  cpi '.'
  jz mark_barrel_place
  cpi '&'
  jz mark_barrel_place

print_level_character:
  push b
  mov c, a
  call monitor_putchar
  pop b
  dcr e
  jnz print_level_width_loop
  mov e, b
  dcr d
  jnz print_level_height_loop

  inx h
  mov a, m
  inx h
  mov l, m
  mov h, a
  xchg

  lhld player_xy
  dad d
  call set_cursor
  lhld monitor32_cursor_addr
  shld player_addr

  mvi m, 9

  pop h
  pop d
  pop b
  pop psw
  ret

mark_barrel_place:
  push h
  push d
  push psw

  lhld monitor32_cursor_addr
  xchg

  lhld current_barrel
  mov m, e
  inx h
  mov m, d
  inx h
  shld current_barrel

  lda barrel_count
  inr a
  sta barrel_count

  pop psw
  pop d
  pop h
  jmp print_level_character

check_barrels:
  push h
  push d
  push b
  lda barrel_count
  mov c, a
  mov b, a
  lxi h, barrels
check_barrels_loop:
  mov e, m
  inx h
  mov d, m
  inx h
  xchg
  mov a, m
  cpi ' '
  jz check_barrels_restore
  cpi '&'
  jnz check_barrels_loop_prolog
  dcr b
check_barrels_loop_prolog:
  xchg
  dcr c
  jnz check_barrels_loop
  mov a, b
  pop b
  pop d
  pop h
  ret

check_barrels_restore:
  mvi m, '.'
  jmp check_barrels_loop_prolog

; H - X
; L - Y  
set_cursor:
  push h
  push d
  push b
  push psw
  lxi d, 2020h
  dad d
  shld set_cursor_msg + 2
  lxi h, set_cursor_msg
  call monitor_putstr
  pop psw
  pop b
  pop d
  pop h
  ret

set_cursor_msg:
  db 1bh, 59h, 20h, 20h, 0

player_xy dw 0
player_addr dw 0

offset_xy:
offset_y db 0
offset_x db 0

; C is the current repeat counter.
extract_byte:
  lda current_byte
  dcr c
  rp                            ; return if c >= 0
  inr c                         ; C = 0
  call extract_bit
  jz extract_byte_counter_1     ; counter is 1

  ; Decode the counter from 4 bits: 1 D3 D2 D1 
  ; N = D3*4 + D2*2 + D1 + 2
  xra a
  call extract_bit
  jz extract_byte_d3_0
  ori 04h
extract_byte_d3_0:
  call extract_bit
  jz extract_byte_d2_0
  ori 02h
extract_byte_d2_0:
  call extract_bit
  jz extract_byte_d1_0
  ori 01h
extract_byte_d1_0:
  inr a
  mov c, a

extract_byte_counter_1:
  call extract_bit
  jz extract_byte_value_0

  mvi a, '*'      ; 10
  sta current_byte
  call extract_bit
  rz

  call extract_bit
  mvi a, '.'      ; 110
  sta current_byte
  rz
  mvi a, '&'      ; 111
  sta current_byte
  ret

extract_byte_value_0:
  call extract_bit
  mvi a, ' '      ; 00
  sta current_byte
  rz
  mvi a, 17h      ; 01
  sta current_byte
  ret 

current_byte:
  db '-'

extract_bit:
  sta extract_bit_keep_a
  lda extract_bit_mask
  cpi 01h
  jnz extract_bit_1
  inx h
extract_bit_1:
  rrc
  sta extract_bit_mask
  ana m
  lda extract_bit_keep_a
  ret

extract_bit_keep_a:
  db 0

extract_bit_mask:
  db 01h

print_dec:
  push psw
  push b
  mvi b, 0ffh
print_dec_loop:
  inr b
  sui 10
  jp print_dec_loop
  adi 10
  sta print_dec_tmp
  mvi a, '0'
  add b
  mov c, a
  cpi '0'
  jnz print_dec_skip_0
  mvi c, ' '
print_dec_skip_0:
  call monitor_putchar
  lda print_dec_tmp
  adi '0'
  mov c, a
  call monitor_putchar
  pop b
  pop psw
  ret

print_dec_tmp db 0

number_of_maze_msg:
  db 1bh, 59h, (25/2) + 20h, (64-number_of_maze_msg_sz)/2 + 20h
number_of_maze_text:
  db "nomer urownq: "
number_of_maze_msg_sz equ $-number_of_maze_text
  db 0

congratulations_msg:
  db 1fh, 1bh, 59h, (25/2) + 20h, (64-congratulations_msg_sz)/2 + 20h
congratulations_text:
  db "pozdrawlq\` !!!"
congratulations_msg_sz equ $-congratulations_text
  db 0

copyright_msg:
  db 1fh, 1bh, 59h, 23 + 20h, (64-copyright_msg_sz)/2 + 20h
copyright_text:
  db "sokoban, awtor aleksandr demin, (C) 2012"
copyright_msg_sz equ $-copyright_text
  db 0

levels:
  dw level_01
  dw level_02
  dw level_03
  dw level_04
  dw level_05
  dw level_06
  dw level_07
  dw level_08
  dw level_09
  dw level_10
  dw level_11
  dw level_12
  dw level_13
  dw level_14
  dw level_15
  dw level_16
  dw level_17
  dw level_18
  dw level_19
  dw level_20
  dw level_21
  dw level_22
  dw level_23
  dw level_24
  dw level_25
  dw level_26
  dw level_27
  dw level_28
  dw level_29
  dw level_30
  dw level_31
  dw level_32
  dw level_33
  dw level_34
  dw level_35
  dw level_36
  dw level_37
  dw level_38
  dw level_39
  dw level_40
  dw level_41
  dw level_42
  dw level_43
  dw level_44
  dw level_45
  dw level_46
  dw level_47
  dw level_48
  dw level_49
  dw level_50
  dw level_51
  dw level_52
  dw level_53
  dw level_54
  dw level_55
  dw level_56
  dw level_57
  dw level_58
  dw level_59
  dw level_60

level_01        db 16h, 0Bh, 0A2h, 0DFh, 38h, 32h, 1Fh, 38h, 2Ah, 3, 0E6h
                db 12h, 0C0h, 0A5h, 0F2h, 83h, 2, 81h, 3, 0E4h, 12h, 82h
                db 25h, 6, 0CDh, 64h, 22h, 51h, 0ACh, 11h, 0A1h, 0Ah, 5
                db 0E5h, 11h, 0B1h, 14h, 82h, 29h, 82h, 31h, 0A0h, 0E1h
                db 2Ch, 18h, 0D1h, 0CFh, 80h, 0Ch, 8
level_02        db 0Eh, 0Ah, 0F6h, 58h, 0Ch, 68h, 0Dh, 94h, 0C6h, 80h
                db 85h, 2, 82h, 18h, 0D0h, 15h, 4Ch, 10h, 0C6h, 0C2h, 18h
                db 21h, 8Dh, 1, 6, 4, 39h, 10h, 0A0h, 81h, 80h, 85h, 2
                db 8, 20h, 60h, 34h, 1Bh, 0Ch, 1Eh, 0CAh, 7, 4
level_03        db 11h, 0Ah, 0E3h, 9Fh, 0Eh, 7, 0C2h, 11h, 42h, 1Fh, 8
                db 50h, 23h, 0E0h, 85h, 4, 0Ch, 1Eh, 84h, 8, 0A6h, 0B4h
                db 10h, 85h, 2, 82h, 59h, 0D4h, 28h, 14h, 90h, 0D6h, 83h
                db 0DFh, 7Ch, 0Eh, 1
level_04        db 16h, 0Dh, 0F2h, 0CEh, 7Ch, 0B0h, 0C1h, 58h, 0C9h, 0ECh
                db 0B0h, 56h, 32h, 1Ah, 0Ch, 8, 29h, 2Bh, 19h, 8, 98h
                db 0A8h, 10h, 30h, 56h, 32h, 18h, 15h, 88h, 18h, 2Bh, 19h
                db 8, 88h, 14h, 10h, 5Eh, 0CBh, 2, 6, 0C3h, 0A1h, 90h
                db 8Fh, 74h, 34h, 28h, 21h, 0F2h, 42h, 22h, 31h, 40h, 7Ch
                db 90h, 0C8h, 64h, 87h, 0C9h, 3Dh, 0F2h, 80h, 8, 0Ah
level_05        db 11h, 0Dh, 0E2h, 0DFh, 24h, 32h, 5Bh, 0C1h, 5, 43h, 1
                db 0E0h, 0D8h, 87h, 0A4h, 4Bh, 24h, 35h, 0A0h, 84h, 28h
                db 15h, 35h, 0A8h, 42h, 21h, 8, 35h, 0A0h, 85h, 40h, 0A0h
                db 23h, 0D8h, 14h, 10h, 0F8h, 42h, 0Ah, 3, 0E4h, 0A2h
                db 10h, 7Ch, 80h, 0D0h, 7Ch, 83h, 10h, 0Eh, 7
level_06        db 0Ch, 0Bh, 0C6h, 9, 41h, 8Dh, 1, 10h, 89h, 63h, 41h
                db 2Ch, 90h, 0C6h, 0B2h, 21h, 0Ch, 68h, 8, 21h, 8, 63h
                db 4Ah, 8, 42h, 0D0h, 81h, 50h, 19h, 0Ch, 8, 84h, 0Ch
                db 84h, 28h, 14h, 6, 43h, 4, 32h, 19h, 3Dh, 9, 1
level_07        db 0Dh, 0Ch, 0D2h, 0D8h, 35h, 92h, 90h, 60h, 84h, 44h
                db 21h, 0A1h, 61h, 0Ch, 0Ah, 9, 64h, 0A4h, 5Ah, 0A9h, 0Ah
                db 9, 44h, 62h, 8, 41h, 4, 27h, 10h, 68h, 96h, 71h, 4
                db 44h, 8, 33h, 88h, 30h, 4Ah, 2Dh, 14h, 0F8h, 5, 2
level_08        db 10h, 11h, 82h, 9Fh, 24h, 30h, 7Bh, 0Ch, 6, 85h, 22h
                db 8, 18h, 8, 44h, 20h, 60h, 50h, 18h, 0Ch, 8, 28h, 0Dh
                db 14h, 84h, 41h, 82h, 91h, 8, 28h, 20h, 0A0h, 86h, 48h
                db 68h, 40h, 0A3h, 21h, 12h, 0C0h, 0A8h, 41h, 4, 8, 0A6h
                db 0Fh, 60h, 96h, 9, 78h, 38h, 1Eh, 0Eh, 7, 83h, 98h, 0F0h
                db 73h, 1Eh, 0Eh, 63h, 0C7h, 38h, 0, 1, 6
level_09        db 11h, 12h, 0F0h, 6Bh, 0E0h, 30h, 4Eh, 38h, 5Bh, 4, 0E3h
                db 81h, 0C2h, 71h, 0C0h, 0C1h, 0Ch, 13h, 8Eh, 10h, 88h
                db 60h, 9Ch, 6Ch, 94h, 73h, 61h, 13h, 8, 6Ch, 0B6h, 4
                db 10h, 0D6h, 42h, 82h, 90h, 0C9h, 0Ch, 0Ah, 5, 42h, 81h
                db 0Dh, 44h, 41h, 0Bh, 6Ch, 21h, 50h, 7Ch, 0A4h, 4Bh, 0E4h
                db 86h, 3, 0E5h, 6, 3, 0E5h, 6, 3, 0E5h, 14h, 0D8h, 1
                db 0Ah
level_10        db 15h, 14h, 0F2h, 0CAh, 7Ch, 93h, 18h, 0Fh, 92h, 1Dh
                db 0Fh, 92h, 18h, 29h, 12h, 0C1h, 2Ch, 16h, 89h, 68h, 22h
                db 11h, 4Ch, 93h, 3, 41h, 4, 45h, 24h, 41h, 48h, 6Bh, 4Bh
                db 4, 0C6h, 85h, 1, 0BDh, 8, 52h, 11h, 10h, 88h, 1Bh, 0D4h
                db 0C8h, 60h, 54h, 1Bh, 0C6h, 3, 21h, 8, 20h, 81h, 0BCh
                db 60h, 23h, 51h, 2Dh, 0E3h, 1, 90h, 0C0h, 82h, 80h, 0DEh
                db 30h, 4Ah, 8, 88h, 20h, 0B5h, 0A0h, 83h, 2, 0C0h, 0F0h
                db 41h, 13h, 9, 81h, 0E0h, 83h, 0A1h, 7, 82h, 3Dh, 7, 83h
                db 0E4h, 7, 8Fh, 69h, 0A0h, 2, 5
level_11        db 13h, 0Fh, 0F0h, 53h, 0E0h, 0A4h, 18h, 0Fh, 12h, 0C1h
                db 2Ah, 7, 48h, 70h, 50h, 1Ch, 21h, 81h, 8, 0A1h, 10h
                db 0E0h, 60h, 2Ah, 1Bh, 0Eh, 4, 10h, 84h, 40h, 89h, 6Ch
                db 32h, 20h, 60h, 21h, 0Fh, 68h, 30h, 44h, 0Ch, 96h, 88h
                db 42h, 0F2h, 16h, 0A2h, 58h, 3Dh, 8Ch, 23h, 11h, 4Eh
                db 86h, 71h, 63h, 0E4h, 86h, 0F1h, 0F2h, 4Dh, 7Ch, 90h
                db 7, 3
level_12        db 0Dh, 10h, 83h, 0DAh, 0Bh, 0B3h, 97h, 67h, 34h, 16h
                db 76h, 76h, 76h, 34h, 17h, 67h, 67h, 67h, 34h, 16h, 76h
                db 76h, 76h, 34h, 17h, 67h, 67h, 67h, 34h, 4Bh, 24h, 0B8h
                db 19h, 0Dh, 18h, 8Dh, 7Ch, 82h, 10h, 82h, 8, 20h, 84h
                db 0A1h, 4, 10h, 42h, 10h, 50h, 41h, 4, 11h, 80h, 0C8h
                db 82h, 90h, 0C0h, 60h, 0B6h, 3, 5, 32h, 52h, 0, 6, 0Dh
level_13        db 14h, 0Dh, 0A3h, 0DFh, 25h, 92h, 18h, 2Dh, 92h, 5Ch
                db 0Ch, 6, 4Bh, 60h, 88h, 14h, 0Ch, 6, 9, 0C2h, 10h, 60h
                db 44h, 28h, 41h, 5, 8Bh, 8, 60h, 84h, 15h, 1, 0A2h, 70h
                db 84h, 23h, 42h, 4, 10h, 58h, 0B0h, 86h, 88h, 60h, 85h
                db 4, 27h, 8, 42h, 10h, 0C8h, 60h, 28h, 0B1h, 61h, 28h
                db 8Ah, 5, 22h, 81h, 4Eh, 4, 15h, 6, 34h, 43h, 1, 6, 43h
                db 47h, 0A4h, 5Bh, 0E5h, 80h, 7, 4
level_14        db 11h, 0Dh, 0F7h, 50h, 7Ch, 0B0h, 82h, 8, 0C6h, 0C2h
                db 8, 30h, 20h, 82h, 8, 0C0h, 41h, 6, 44h, 14h, 90h, 89h
                db 41h, 5, 4, 14h, 0B3h, 0A1h, 6, 44h, 14h, 10h, 0CEh
                db 84h, 4Bh, 30h, 42h, 19h, 0D0h, 0D8h, 44h, 22h, 19h
                db 0D8h, 0C9h, 8, 86h, 71h, 0A2h, 0DBh, 25h, 0E0h, 0D8h
                db 7Ch, 1Ah, 0C0h, 7, 4
level_15        db 11h, 11h, 0D2h, 9Fh, 5, 30h, 1Fh, 21h, 80h, 0C0h, 7Ch
                db 30h, 20h, 81h, 0D2h, 50h, 54h, 94h, 0D0h, 60h, 50h
                db 42h, 0A4h, 34h, 18h, 0Ch, 88h, 10h, 8Dh, 6, 3, 82h
                db 14h, 88h, 45h, 2Ah, 1Bh, 8, 21h, 1Bh, 0C4h, 19h, 8
                db 30h, 29h, 0CEh, 0C1h, 11h, 6Ch, 6, 0F1h, 90h, 0C0h
                db 64h, 94h, 6Bh, 1, 11h, 40h, 60h, 3Ah, 18h, 0Dh, 87h
                db 4Ch, 64h, 3Eh, 49h, 6Eh, 80h, 6, 6
level_16        db 0Eh, 0Fh, 0B7h, 0C3h, 24h, 3Ch, 1Ah, 0Ch, 14h, 0C0h
                db 42h, 82h, 98h, 0Ch, 6, 8, 82h, 91h, 18h, 25h, 80h, 0AAh
                db 21h, 80h, 0C1h, 0Ch, 8, 21h, 8, 21h, 41h, 8, 84h, 31h
                db 6, 2, 0A1h, 50h, 16h, 22h, 59h, 14h, 68h, 58h, 0C0h
                db 68h, 2Ch, 0F3h, 8Ch, 4, 44h, 0Dh, 0E3h, 1, 83h, 0D8h
                db 0Ch, 7, 0C1h, 4Fh, 0, 3, 5
level_17        db 12h, 10h, 0D3h, 5Bh, 35h, 0B0h, 0D8h, 6Ch, 21h, 4, 0Dh
                db 86h, 20h, 64h, 0F4h, 11h, 2Eh, 68h, 64h, 20h, 0C8h
                db 0B3h, 42h, 8, 20h, 89h, 73h, 59h, 2Ch, 94h, 89h, 41h
                db 52h, 0C0h, 54h, 86h, 5, 1, 4, 18h, 10h, 9Ah, 2, 14h
                db 20h, 83h, 22h, 8, 4Bh, 10h, 20h, 8Bh, 6Ch, 52h, 10h
                db 6Ch, 94h, 4Bh, 21h, 7, 43h, 61h, 90h, 0E9h, 0CCh, 7
                db 0CBh, 29h, 0, 0Ah, 2
level_18        db 16h, 0Dh, 0C3h, 0D9h, 7Ch, 6, 6, 82h, 19h, 0Fh, 80h
                db 82h, 0DAh, 1Bh, 31h, 10h, 0CEh, 22h, 99h, 21h, 82h
                db 19h, 0D4h, 0D9h, 68h, 42h, 19h, 0D4h, 20h, 60h, 50h
                db 43h, 64h, 61h, 8, 22h, 11h, 0Ch, 16h, 0A9h, 51h, 0Ah
                db 3, 21h, 10h, 89h, 60h, 34h, 42h, 84h, 40h, 83h, 1, 92h
                db 20h, 41h, 8, 10h, 0A1h, 6, 3, 0E7h, 86h, 0Fh, 79h, 80h
                db 0F9h, 0E5h, 20h, 0Fh, 2
level_19        db 1Ch, 14h, 0E3h, 1Fh, 3Ch, 0A0h, 0D1h, 4Fh, 9Ch, 5Ah
                db 14h, 87h, 0CEh, 0Ch, 90h, 0D1h, 4Fh, 96h, 10h, 0A1h
                db 82h, 1Ah, 0Fh, 96h, 19h, 0Ch, 16h, 83h, 0E5h, 84h, 18h
                db 82h, 0A0h, 83h, 0E5h, 86h, 4, 10h, 94h, 10h, 7Ch, 0B0h
                db 83h, 22h, 80h, 82h, 0Fh, 96h, 10h, 60h, 28h, 0C8h, 41h
                db 0F2h, 88h, 45h, 32h, 10h, 41h, 0F2h, 83h, 2, 82h, 0D0h
                db 41h, 14h, 0E9h, 0Dh, 0Ah, 0C5h, 4, 0B0h, 7Bh, 4, 0A1h
                db 4, 42h, 6, 4Bh, 0D0h, 0D9h, 0Eh, 6, 8, 60h, 37h, 0A1h
                db 15h, 51h, 8Ah, 86h, 42h, 0D0h, 0B4h, 0B4h, 43h, 0E5h
                db 86h, 0B1h, 10h, 0C1h, 0EEh, 32h, 56h, 30h, 18h, 0Fh
                db 94h, 5Bh, 4, 30h, 53h, 0E7h, 14h, 80h, 0Ch, 1
level_20        db 14h, 14h, 0D3h, 0D9h, 78h, 3Fh, 98h, 0E1h, 2Bh, 16h
                db 2Ch, 58h, 0C6h, 38h, 19h, 3Fh, 1Ch, 0Ch, 8, 20h, 83h
                db 0B3h, 0B1h, 0B3h, 51h, 0ACh, 14h, 0C8h, 68h, 86h, 3
                db 4, 34h, 20h, 68h, 21h, 8, 41h, 80h, 0A2h, 25h, 12h
                db 0A9h, 25h, 0Ah, 4, 14h, 84h, 20h, 82h, 10h, 0C0h, 42h
                db 10h, 0E8h, 50h, 86h, 45h, 4Ah, 0A5h, 43h, 5, 0B0h, 43h
                db 21h, 0A0h, 0C0h, 64h, 28h, 43h, 21h, 4, 45h, 1, 90h
                db 0C8h, 42h, 6, 5, 41h, 92h, 50h, 44h, 40h, 0C0h, 84h
                db 0B6h, 10h, 68h, 21h, 8, 74h, 23h, 90h, 78h, 3Eh, 3
                db 0C7h, 0B2h, 0C8h, 6, 4
level_21        db 10h, 0Eh, 93h, 0D3h, 81h, 8Dh, 1, 90h, 0E0h, 63h, 60h
                db 70h, 31h, 0A0h, 30h, 53h, 26h, 0B0h, 18h, 21h, 80h
                db 0F9h, 21h, 80h, 0C0h, 60h, 86h, 3, 5, 0A2h, 18h, 29h
                db 12h, 0C0h, 0A0h, 0B4h, 18h, 21h, 4, 28h, 14h, 4, 28h
                db 21h, 81h, 40h, 0A4h, 32h, 62h, 21h, 1Ah, 0D0h, 68h
                db 3Eh, 0Ch, 74h, 2, 0Ah
level_22        db 16h, 14h, 0F2h, 4Ah, 74h, 0F6h, 58h, 2Dh, 90h, 0D0h
                db 60h, 30h, 28h, 0Ch, 90h, 0C0h, 42h, 8, 28h, 10h, 21h
                db 5, 21h, 82h, 14h, 14h, 86h, 2, 14h, 88h, 11h, 2Ch, 9Eh
                db 0CAh, 21h, 6, 4, 11h, 80h, 0E6h, 021h, 18h, 8, 32h
                db 18h, 0Eh, 68h, 41h, 80h, 0C1h, 8, 84h, 11h, 78h, 0C0h
                db 60h, 20h, 0E0h, 0B3h, 4, 0Ch, 4, 10h, 84h, 20h, 0E6h
                db 30h, 18h, 0Ch, 8, 23h, 1, 0CCh, 42h, 30h, 10h, 0A4h
                db 30h, 42h, 0ADh, 80h, 0C0h, 42h, 8, 52h, 10h, 50h, 20h
                db 8Ch, 10h, 83h, 62h, 8, 20h, 0A4h, 94h, 18h, 31h, 0Ah
                db 85h, 41h, 7, 0C2h, 35h, 4, 6Ah, 0Ah, 0F0h, 1Dh, 0Ch
                db 9Eh, 0C3h, 0A5h, 0BEh, 0, 0Bh, 4
level_23        db 19h, 0Eh, 0D3h, 5Fh, 3Ch, 30h, 18h, 29h, 0F3h, 2, 11h
                db 40h, 0C1h, 0Eh, 9Ch, 0C0h, 60h, 32h, 7Bh, 5Ah, 2, 11h
                db 40h, 0C0h, 8Ch, 6, 48h, 6Bh, 10h, 6Ch, 2Ah, 3, 84h
                db 31h, 8Bh, 50h, 8Ch, 4, 2Ah, 0Ah, 82h, 19h, 0D0h, 43h
                db 1, 40h, 0A8h, 0Ch, 6, 48h, 6Bh, 8, 42h, 36h, 2Fh, 75h
                db 80h, 0C4h, 54h, 7, 0CBh, 8, 46h, 3, 2, 3Eh, 58h, 60h
                db 30h, 19h, 0Fh, 96h, 53h, 5, 0BEh, 71h, 4Fh, 90h, 0
                db 5, 7
level_24        db 15h, 13h, 93h, 0D3h, 0E4h, 7, 0B5h, 3Ch, 16h, 2Ch, 6Bh
                db 18h, 0Fh, 7, 0B4h, 40h, 0F0h, 6Ch, 69h, 60h, 0A6h, 4Fh
                db 60h, 40h, 0C8h, 64h, 36h, 29h, 10h, 50h, 20h, 64h, 30h
                db 1Ah, 0Ch, 8, 23h, 1, 92h, 11h, 6Ch, 86h, 3, 1, 90h
                db 85h, 61h, 92h, 90h, 60h, 86h, 4, 64h, 22h, 18h, 0Ch
                db 6, 3, 44h, 2Ah, 5Ah, 0Ch, 10h, 82h, 15h, 8, 18h, 0Ch
                db 6, 42h, 2Dh, 0A0h, 88h, 41h, 10h, 88h, 68h, 28h, 83h
                db 2, 81h, 5, 21h, 0A0h, 83h, 2, 33h, 40h, 64h, 34h, 4Bh
                db 2, 0C2h, 0DCh, 21h, 80h, 0C0h, 60h, 3Eh, 41h, 0E9h
                db 0A0h, 5, 0Fh
level_25        db 17h, 11h, 0F3h, 0Ah, 7Ch, 0B3h, 18h, 2Dh, 0A3h, 5Dh
                db 0Ch, 86h, 83h, 82h, 8, 42h, 8, 20h, 0D0h, 60h, 0A4h
                db 28h, 0Dh, 8Ch, 68h, 38h, 20h, 41h, 10h, 0B1h, 63h, 44h
                db 2Ah, 94h, 10h, 42h, 16h, 2Ch, 68h, 36h, 1Ah, 29h, 69h
                db 68h, 21h, 49h, 8Ch, 5, 8Bh, 6Bh, 34h, 3Ah, 16h, 2Dh
                db 0Eh, 6, 82h, 8Ah, 95h, 83h, 42h, 29h, 6, 0EAh, 8, 9Dh
                db 8, 34h, 2Bh, 0Ch, 84h, 4Eh, 84h, 19h, 21h, 10h, 0D9h
                db 2Ch, 0E8h, 46h, 2Bh, 18h, 35h, 0E0h, 0D0h, 60h, 36h
                db 7Ah, 68h, 0A6h, 0C0h, 11h, 9
level_26        db 0Fh, 0Fh, 0F7h, 3, 0A1h, 0C0h, 0E9h, 4Ch, 90h, 8Ah
                db 41h, 80h, 0C9h, 8, 22h, 1Ah, 0Ch, 84h, 4Ch, 14h, 11h
                db 19h, 0Ch, 4, 42h, 14h, 6, 43h, 1, 10h, 0C0h, 87h, 30h
                db 4Ch, 11h, 80h, 83h, 24h, 32h, 56h, 20h, 83h, 21h, 6
                db 30h, 62h, 0Ch, 84h, 11h, 0Ch, 0E2h, 2Dh, 0Ah, 3, 38h
                db 0D9h, 0Ch, 96h, 0E1h, 6Dh, 0, 4, 4
level_27        db 17h, 0Dh, 1Eh, 0F3h, 81h, 9Dh, 21h, 0A0h, 0C9h, 2Ch
                db 90h, 0DEh, 81h, 42h, 8, 21h, 3, 21h, 0CCh, 60h, 50h
                db 18h, 14h, 6, 43h, 98h, 0C0h, 60h, 20h, 82h, 21h, 83h
                db 0D0h, 0A0h, 40h, 83h, 4, 0B0h, 1Bh, 0Ah, 85h, 8, 44h
                db 32h, 11h, 0Ch, 8Ah, 82h, 14h, 0Ah, 42h, 8, 30h, 42h
                db 25h, 6, 0Bh, 51h, 4, 10h, 84h, 56h, 29h, 15h, 84h, 10h
                db 0A8h, 50h, 0A1h, 0C8h, 23h, 5Ah, 21h, 0C2h, 5Dh, 31h
                db 0F0h, 0, 0Ah, 0Bh
level_28        db 0Fh, 11h, 0B3h, 5Eh, 0Ch, 6, 3, 0C1h, 0Ah, 43h, 0A4h
                db 0A2h, 10h, 68h, 0A4h, 28h, 8, 86h, 43h, 0A1h, 82h, 18h
                db 8, 41h, 52h, 10h, 30h, 11h, 10h, 30h, 18h, 11h, 80h
                db 0A8h, 14h, 85h, 40h, 44h, 30h, 44h, 64h, 88h, 4Ah, 22h
                db 80h, 0C0h, 60h, 42h, 1Bh, 29h, 0Ah, 8, 60h, 2Ah, 18h
                db 0D0h, 0C9h, 48h, 63h, 5Ah, 0D8h, 8, 0DDh, 0Dh, 6, 0B4h
                db 91h, 8Dh, 1Eh, 0C3h, 0, 6, 1
level_29        db 18h, 0Bh, 0F3h, 4Bh, 7Ch, 18h, 89h, 64h, 0A6h, 4Bh
                db 68h, 94h, 20h, 0A0h, 42h, 0D8h, 21h, 5, 5, 42h, 6, 48h
                db 6Bh, 49h, 10h, 41h, 40h, 0A4h, 2Ah, 58h, 0C0h, 88h
                db 41h, 92h, 55h, 8, 30h, 43h, 5Ah, 82h, 25h, 0A0h, 0D1h
                db 0Dh, 6Ah, 8, 86h, 5, 4, 0A8h, 43h, 1Bh, 18h, 14h, 6
                db 0Ah, 46h, 34h, 19h, 25h, 0D0h, 0F9h, 0EEh, 20h, 13h
                db 9
level_30        db 0Eh, 14h, 16h, 0F8h, 64h, 0D6h, 42h, 10h, 96h, 43h
                db 21h, 0Ah, 88h, 81h, 92h, 11h, 4Ch, 86h, 9, 41h, 80h
                db 89h, 60h, 32h, 18h, 8, 86h, 42h, 22h, 0A1h, 3, 21h
                db 90h, 82h, 10h, 0F4h, 19h, 0Ch, 4, 19h, 15h, 32h, 10h
                db 60h, 56h, 28h, 8, 86h, 4Bh, 44h, 23h, 0D3h, 4, 0B5h
                db 88h, 50h, 21h, 0Dh, 0E2h, 22h, 30h, 43h, 18h, 46h, 21h
                db 40h, 84h, 37h, 94h, 86h, 9, 60h, 0F4h, 8Ah, 7Ch, 8
                db 6
level_31        db 0Fh, 0Ch, 1Ah, 0F0h, 60h, 30h, 5Bh, 24h, 30h, 18h, 0Ch
                db 0E9h, 41h, 81h, 18h, 0Ch, 0E8h, 8, 21h, 3, 10h, 9Dh
                db 1, 6, 4, 60h, 33h, 83h, 10h, 64h, 21h, 7Ah, 56h, 88h
                db 21h, 2Ch, 6, 8, 81h, 90h, 8Ch, 60h, 86h, 20h, 70h, 38h
                db 43h, 87h, 20h, 0Dh, 9
level_32        db 12h, 10h, 82h, 9Fh, 2Ch, 30h, 7Bh, 64h, 30h, 43h, 1
                db 90h, 0D8h, 60h, 44h, 20h, 0A4h, 0A6h, 2, 0A0h, 50h
                db 10h, 82h, 30h, 53h, 2, 84h, 14h, 15h, 90h, 0C0h, 60h
                db 20h, 0C9h, 34h, 10h, 85h, 42h, 81h, 42h, 2Dh, 8, 20h
                db 51h, 80h, 0C0h, 64h, 86h, 9, 60h, 95h, 3, 41h, 80h
                db 0D6h, 0B0h, 0D1h, 4Eh, 6Ah, 70h, 35h, 0A9h, 0F0h, 0CEh
                db 87h, 0C9h, 0Ch, 0E3h, 0E5h, 16h, 0F8h, 0, 8, 2
level_33        db 0Dh, 0Fh, 0C2h, 9Bh, 2Dh, 80h, 0D1h, 0Dh, 88h, 0C9h
                db 8, 50h, 42h, 25h, 4, 20h, 81h, 0Ah, 2, 29h, 10h, 0C8h
                db 8Ch, 6, 0B1h, 41h, 3, 1, 0ACh, 64h, 46h, 3, 5Ah, 8
                db 84h, 20h, 0CEh, 4, 29h, 8, 0C5h, 5, 1, 0C0h, 0C9h, 2Eh
                db 5, 9, 74h, 30h, 1Fh, 29h, 90h, 1, 4
level_34        db 0Ch, 0Fh, 0F6h, 0DBh, 21h, 82h, 59h, 14h, 88h, 5Ah
                db 21h, 11h, 8, 64h, 40h, 0D1h, 8, 98h, 11h, 6Ch, 84h
                db 10h, 84h, 0B0h, 18h, 0Ch, 8, 42h, 11h, 8, 0D1h, 0Ch
                db 91h, 88h, 0E6h, 30h, 40h, 88h, 6Fh, 10h, 88h, 96h, 0B1h
                db 81h, 0Ah, 63h, 43h, 47h, 0B4h, 80h, 0Ah, 0Ah
level_35        db 14h, 10h, 0F6h, 58h, 35h, 90h, 0D0h, 45h, 35h, 0A1h
                db 92h, 23h, 0A5h, 0E8h, 64h, 22h, 59h, 21h, 15h, 0A5h
                db 10h, 89h, 60h, 32h, 56h, 20h, 84h, 15h, 84h, 42h, 29h
                db 6, 4, 14h, 30h, 1Dh, 2Dh, 6, 0Ah, 44h, 22h, 11h, 0Ch
                db 4, 15h, 24h, 22h, 1Ah, 21h, 0Ah, 5, 1, 10h, 8Eh, 41h
                db 8, 2Ah, 8, 38h, 18h, 10h, 84h, 42h, 8, 38h, 11h, 15h
                db 91h, 40h, 70h, 84h, 42h, 25h, 0Ah, 3, 0A1h, 0A0h, 83h
                db 41h, 0D3h, 11h, 8Eh, 0, 0Ah, 1
level_36        db 12h, 13h, 0B2h, 9Fh, 24h, 96h, 8, 78h, 0A6h, 5, 1, 0E0h
                db 0C8h, 82h, 82h, 9Bh, 8, 52h, 10h, 0A4h, 22h, 0D8h, 0Ch
                db 6, 44h, 8, 31h, 0A5h, 45h, 0Ah, 55h, 31h, 88h, 32h
                db 5Ah, 21h, 13h, 88h, 28h, 88h, 44h, 22h, 18h, 23h, 10h
                db 41h, 0A1h, 59h, 38h, 83h, 25h, 22h, 58h, 23h, 11h, 28h
                db 84h, 18h, 21h, 13h, 8Ch, 10h, 0A1h, 4Ah, 12h, 0C6h
                db 30h, 19h, 21h, 0A0h, 83h, 18h, 88h, 44h, 50h, 0C0h
                db 81h, 14h, 83h, 65h, 40h, 0E0h, 42h, 12h, 0D0h, 70h
                db 32h, 11h, 8Eh, 16h, 0F9h, 20h, 7, 8
level_37        db 15h, 0Fh, 0F6h, 1Fh, 1, 0CDh, 27h, 0B0h, 1Ch, 0D2h
                db 18h, 21h, 90h, 0C0h, 63h, 4Ah, 15h, 0Ah, 0C3h, 1, 9Ch
                db 10h, 40h, 0C1h, 2Ch, 86h, 3, 38h, 0ABh, 68h, 30h, 18h
                db 25h, 0A0h, 0C8h, 54h, 4, 29h, 60h, 30h, 44h, 10h, 50h
                db 28h, 60h, 40h, 0C0h, 60h, 52h, 14h, 60h, 86h, 83h, 4
                db 0A2h, 10h, 60h, 43h, 59h, 0Ch, 8, 21h, 8, 87h, 0C3h
                db 42h, 81h, 40h, 7Ch, 86h, 42h, 0Ch, 87h, 0C1h, 68h, 0B7h
                db 0CBh, 25h, 0F0h, 0, 9, 0Dh
level_38        db 0Eh, 0Fh, 1Eh, 0D8h, 6Bh, 49h, 0Dh, 5, 8Bh, 18h, 10h
                db 86h, 8, 6Bh, 10h, 60h, 84h, 11h, 58h, 0C0h, 60h, 96h
                db 0C2h, 84h, 28h, 4Ah, 25h, 81h, 50h, 41h, 50h, 20h, 82h
                db 30h, 10h, 41h, 81h, 4, 21h, 4, 18h, 25h, 82h, 18h, 8
                db 34h, 42h, 21h, 10h, 83h, 2, 6, 5, 1, 82h, 54h, 14h
                db 92h, 0D0h, 60h, 0B7h, 0Ah, 74h, 0Ah, 3
level_39        db 17h, 12h, 0F2h, 0C9h, 7Ch, 0F0h, 42h, 0D2h, 0F9h, 0C1h
                db 0ACh, 6Ch, 0F6h, 9Ah, 0C6h, 88h, 64h, 86h, 0C8h, 6Bh
                db 63h, 4, 50h, 0C0h, 0A0h, 86h, 0B5h, 10h, 0E1h, 10h
                db 46h, 0Ah, 0C6h, 48h, 60h, 42h, 11h, 10h, 20h, 0D6h
                db 30h, 4Bh, 2, 10h, 85h, 1, 10h, 89h, 60h, 22h, 11h, 68h
                db 97h, 0C2h, 21h, 91h, 40h, 85h, 0A2h, 58h, 8, 21h, 4Bh
                db 1, 16h, 82h, 29h, 6, 45h, 21h, 0D0h, 0E0h, 60h, 40h
                db 0A0h, 82h, 96h, 3, 81h, 13h, 10h, 0A4h, 22h, 9Ch, 0Dh
                db 6, 8, 81h, 0F2h, 0Ch, 64h, 97h, 0CDh, 2Dh, 0F2h, 80h
                db 0Bh, 5
level_40        db 0Bh, 0Bh, 0C2h, 91h, 0ACh, 4, 1Bh, 14h, 4, 19h, 14h
                db 21h, 11h, 0Ah, 33h, 88h, 30h, 10h, 0A7h, 40h, 60h, 20h
                db 0B0h, 62h, 21h, 6, 42h, 0Ah, 4, 15h, 2, 0A0h, 83h, 6
                db 0A2h, 9Ch, 0, 8, 1
level_41        db 14h, 0Fh, 0F2h, 0Bh, 7Ch, 0B2h, 19h, 21h, 0F2h, 48h
                db 6Ch, 3Eh, 41h, 0Ch, 11h, 40h, 7Ch, 10h, 88h, 0A0h, 40h
                db 0F8h, 8, 54h, 20h, 64h, 0A6h, 43h, 24h, 42h, 0D0h, 60h
                db 0E4h, 43h, 41h, 6, 37h, 90h, 4Ch, 8, 2Ch, 46h, 0A2h
                db 19h, 21h, 5, 88h, 0D5h, 81h, 41h, 53h, 0FAh, 30h, 32h
                db 21h, 0EEh, 30h, 28h, 0Fh, 94h, 43h, 4, 0BEh, 59h, 4Ch
                db 0, 11h, 8
level_42        db 0Dh, 12h, 1Ch, 0D8h, 44h, 32h, 53h, 1, 0Ah, 45h, 21h
                db 80h, 0C0h, 82h, 13h, 18h, 8, 88h, 83h, 21h, 10h, 0AAh
                db 14h, 84h, 18h, 14h, 17h, 4Ah, 15h, 20h, 0C9h, 0Ch, 0Ah
                db 0B1h, 92h, 11h, 0Dh, 63h, 10h, 84h, 43h, 5Ah, 49h, 64h
                db 0ACh, 60h, 22h, 10h, 6Bh, 18h, 8Ch, 4, 1Ah, 0C6h, 3
                db 1, 0F0h, 0C1h, 48h, 85h, 4Bh, 61h, 0A0h, 0E9h, 8Ch
                db 80h, 2, 1
level_43        db 11h, 10h, 0A3h, 0D9h, 6Ch, 3Eh, 8, 68h, 30h, 10h, 62h
                db 0Ah, 3, 41h, 40h, 0A3h, 4, 30h, 19h, 21h, 10h, 82h
                db 10h, 22h, 19h, 0Ch, 88h, 15h, 1, 6, 83h, 21h, 0Ah, 42h
                db 0Dh, 10h, 84h, 14h, 90h, 83h, 41h, 80h, 0C1h, 0Ch, 8
                db 1Ah, 0Dh, 10h, 88h, 88h, 23h, 18h, 0A4h, 32h, 10h, 6Bh
                db 18h, 39h, 5, 8Ch, 0E1h, 0Fh, 6, 0B4h, 87h, 83h, 5Ah
                db 43h, 0C7h, 0BCh, 0, 0Fh, 3
level_44        db 19h, 13h, 0C3h, 1Fh, 34h, 0B6h, 43h, 0E6h, 86h, 42h
                db 8, 0B7h, 0C9h, 8, 40h, 0C0h, 0A8h, 0C7h, 8, 54h, 12h
                db 88h, 74h, 34h, 4Bh, 4, 41h, 4, 0Ch, 10h, 0C9h, 8Eh
                db 8Ah, 4Ch, 44h, 32h, 43h, 7, 20h, 0D0h, 41h, 80h, 89h
                db 44h, 0B8h, 52h, 0Ah, 20h, 0C0h, 41h, 12h, 8Ah, 44h
                db 31h, 81h, 91h, 8, 41h, 81h, 40h, 0A0h, 2Ah, 18h, 0C0h
                db 0A8h, 60h, 84h, 18h, 8, 20h, 0D9h, 1Ah, 11h, 8, 40h
                db 8Ah, 64h, 22h, 10h, 63h, 1Ah, 14h, 6, 8Bh, 68h, 31h
                db 88h, 20h, 0C1h, 0Fh, 18h, 0C6h, 32h, 11h, 0Fh, 96h
                db 18h, 0D6h, 0C0h, 7Ch, 0B0h, 0C6h, 0D0h, 0F9h, 64h, 30h
                db 4Bh, 4, 3Eh, 61h, 0ECh, 0, 0Dh, 7
level_45        db 13h, 0Bh, 0E3h, 5Eh, 2Dh, 80h, 0C1h, 4Dh, 86h, 43h
                db 22h, 0A0h, 0C1h, 48h, 31h, 8, 44h, 30h, 11h, 0Eh, 4
                db 18h, 21h, 14h, 0C1h, 28h, 45h, 40h, 0A0h, 50h, 43h
                db 3Ah, 82h, 21h, 80h, 0C9h, 0Ch, 0E3h, 81h, 12h, 89h
                db 67h, 18h, 25h, 81h, 40h, 0A0h, 0F4h, 43h, 21h, 90h
                db 0F8h, 3Dh, 9, 7
level_46        db 16h, 11h, 0A3h, 0D8h, 29h, 0D0h, 0C9h, 0Ch, 14h, 0C0h
                db 74h, 32h, 29h, 0Ch, 0Ah, 3, 0A1h, 80h, 88h, 41h, 0B2h
                db 9Ah, 21h, 0Ah, 44h, 22h, 20h, 0C8h, 68h, 0A6h, 3, 1
                db 8, 29h, 31h, 82h, 9Ah, 25h, 9Dh, 0Ch, 85h, 3, 1, 14h
                db 0DEh, 87h, 3, 1, 4, 43h, 7Bh, 50h, 60h, 2Ah, 49h, 67h
                db 19h, 0Ch, 90h, 82h, 11h, 90h, 0CEh, 30h, 43h, 0A2h
                db 81h, 11h, 68h, 84h, 4Dh, 0Ch, 4, 29h, 0Dh, 86h, 43h
                db 1, 12h, 0C1h, 2Dh, 86h, 45h, 1, 50h, 53h, 0A5h, 0B0h
                db 19h, 0Fh, 96h, 73h, 0E0h, 0Bh, 0Eh
level_47        db 13h, 0Fh, 16h, 0F9h, 61h, 90h, 0F9h, 61h, 4, 63h, 0E1h
                db 0C1h, 0Ch, 68h, 21h, 8, 50h, 96h, 43h, 41h, 14h, 85h
                db 42h, 6, 82h, 2Dh, 6, 2, 86h, 30h, 52h, 21h, 58h, 43h
                db 2, 30h, 28h, 8, 84h, 42h, 21h, 0F0h, 83h, 38h, 8Dh
                db 60h, 96h, 9, 0D0h, 1Bh, 29h, 4, 19h, 0C4h, 1Fh, 1, 12h
                db 82h, 0Fh, 80h, 0E8h, 7Ch, 1Eh, 80h, 9, 3
level_48        db 10h, 0Fh, 0D2h, 9Fh, 24h, 30h, 43h, 0E4h, 6, 48h, 7Ch
                db 4, 44h, 21h, 0D2h, 55h, 2, 10h, 0C9h, 4Dh, 0Ah, 42h
                db 25h, 80h, 8Bh, 60h, 20h, 0D0h, 41h, 0ACh, 81h, 4, 19h
                db 10h, 0ACh, 41h, 6, 4, 8, 2Ch, 0F1h, 88h, 22h, 58h, 29h
                db 12h, 83h, 25h, 30h, 28h, 21h, 50h, 0D9h, 28h, 56h, 1Dh
                db 0Ch, 10h, 0C8h, 74h, 0F4h, 7, 0Bh
level_49        db 13h, 10h, 0C3h, 0D9h, 70h, 86h, 35h, 6, 43h, 64h, 31h
                db 9Ch, 2Ah, 10h, 34h, 43h, 19h, 0D8h, 82h, 0Ah, 10h, 0D0h
                db 63h, 3Bh, 10h, 41h, 0Ah, 2, 29h, 9Ch, 60h, 34h, 10h
                db 41h, 82h, 10h, 7Ch, 4, 18h, 10h, 42h, 58h, 8, 22h, 10h
                db 42h, 91h, 48h, 41h, 90h, 0C1h, 2Ch, 52h, 10h, 41h, 4
                db 1Ah, 0Ch, 8Ah, 42h, 8, 0B6h, 2, 11h, 16h, 0E0h, 60h
                db 2Ah, 43h, 21h, 90h, 0C0h, 60h, 30h, 4Bh, 24h, 36h, 18h
                db 0Ch, 7, 3, 44h, 30h, 53h, 86h, 20h, 2, 7
level_50        db 15h, 10h, 0B3h, 0DAh, 78h, 34h, 4Bh, 41h, 0E0h, 0D8h
                db 82h, 82h, 9Ah, 29h, 6, 44h, 15h, 6, 48h, 42h, 80h, 0AAh
                db 42h, 8, 11h, 2Ch, 84h, 19h, 25h, 81h, 2, 8, 50h, 28h
                db 0Ch, 0Ah, 2, 29h, 4, 42h, 0A9h, 5, 18h, 14h, 14h, 88h
                db 60h, 94h, 10h, 41h, 81h, 41h, 0Dh, 8Ah, 45h, 21h, 8
                db 11h, 8Ch, 6, 8, 60h, 21h, 18h, 0Ch, 6, 70h, 0B5h, 40h
                db 60h, 20h, 0C0h, 77h, 11h, 10h, 28h, 10h, 60h, 3Bh, 8Fh
                db 86h, 3, 0BBh, 58h, 21h, 83h, 0DBh, 29h, 0, 5, 9
level_51        db 10h, 0Eh, 0B4h, 53h, 81h, 9Ch, 41h, 82h, 99h, 0Ch, 0E9h
                db 60h, 50h, 19h, 0Dh, 68h, 42h, 81h, 4Ah, 21h, 0ADh, 0Ch
                db 8Ah, 2, 25h, 9Ch, 21h, 8, 20h, 41h, 10h, 0D0h, 60h
                db 50h, 10h, 60h, 84h, 11h, 28h, 0B4h, 20h, 41h, 50h, 2Ah
                db 21h, 81h, 48h, 0A8h, 50h, 43h, 21h, 8, 44h, 10h, 0A6h
                db 0Ch, 60h, 96h, 2, 21h, 0A2h, 9Ah, 25h, 0F2h, 80h, 5
                db 9
level_52        db 15h, 0Eh, 14h, 0F9h, 0A4h, 30h, 5Bh, 0E4h, 87h, 42h
                db 2Dh, 0C0h, 85h, 2Ch, 12h, 0C8h, 70h, 31h, 8Ch, 8, 83h
                db 1, 7, 3, 18h, 0E1h, 11h, 12h, 0D0h, 59h, 0C8h, 30h
                db 14h, 15h, 18h, 0C6h, 30h, 43h, 64h, 28h, 0C9h, 0Bh
                db 3Ah, 81h, 2, 21h, 81h, 59h, 0Ch, 68h, 60h, 52h, 19h
                db 35h, 67h, 85h, 43h, 25h, 0B6h, 18h, 0D0h, 21h, 6Fh
                db 86h, 3, 21h, 0F2h, 8Eh, 7Ch, 0A0h, 5, 0Ch
level_53        db 0Dh, 13h, 93h, 0D3h, 21h, 82h, 59h, 0Ch, 84h, 29h, 14h
                db 6, 43h, 5, 2Ah, 19h, 21h, 6, 3, 1, 82h, 18h, 0Bh, 3Ch
                db 86h, 3, 4, 31h, 8Ch, 6, 3, 21h, 67h, 22h, 18h, 8, 28h
                db 0C6h, 28h, 18h, 8, 40h, 0C6h, 30h, 18h, 8, 20h, 0C7h
                db 30h, 18h, 8, 40h, 0C6h, 2Ah, 18h, 0Dh, 0Ch, 0E6h, 2
                db 25h, 80h, 0C0h, 60h, 96h, 8Ah, 60h, 86h, 0Dh, 54h, 0A1h
                db 60h, 0A0h, 86h, 8, 64h, 32h, 7Bh, 68h, 4, 7
level_54        db 17h, 14h, 1Eh, 0FBh, 2Ch, 6, 48h, 60h, 32h, 19h, 0Ch
                db 86h, 2, 15h, 8Ah, 45h, 22h, 93h, 50h, 60h, 32h, 4Ah
                db 21h, 54h, 0C8h, 44h, 2Bh, 19h, 0Ch, 90h, 85h, 21h, 19h
                db 8Ch, 84h, 21h, 28h, 30h, 11h, 9Ah, 0D9h, 25h, 1Eh, 0C6h
                db 32h, 11h, 4Fh, 80h, 0C6h, 21h, 48h, 60h, 22h, 11h, 28h
                db 96h, 34h, 20h, 0C1h, 48h, 32h, 19h, 21h, 8Dh, 8, 96h
                db 8, 7Ch, 0Ah, 31h, 0D2h, 10h, 64h, 32h, 43h, 1, 92h
                db 18h, 31h, 1Eh, 0DAh, 25h, 0F0h, 19h, 0Dh, 8, 42h, 14h
                db 4, 20h, 82h, 90h, 83h, 44h, 20h, 0A8h, 42h, 30h, 42h
                db 21h, 0A0h, 88h, 60h, 42h, 21h, 48h, 50h, 20h, 41h, 10h
                db 0F8h, 0Ch, 87h, 0Fh, 7Dh, 0C4h, 4, 0Bh
level_55        db 16h, 0Fh, 1Eh, 0FBh, 6Fh, 9Eh, 8, 68h, 40h, 0E1h, 8
                db 32h, 43h, 6, 22h, 58h, 0Ah, 84h, 52h, 8Ch, 90h, 0A3h
                db 5Ah, 42h, 8, 30h, 1Ah, 10h, 35h, 0A1h, 4, 10h, 42h
                db 4, 10h, 41h, 0ADh, 0Ch, 84h, 10h, 81h, 8Ah, 43h, 5Ah
                db 14h, 41h, 4, 10h, 82h, 85h, 1Ah, 0D0h, 0C8h, 41h, 92h
                db 69h, 0Dh, 63h, 41h, 6, 4, 64h, 23h, 10h, 0A5h, 10h
                db 0C0h, 44h, 0B1h, 40h, 0A4h, 40h, 0C1h, 0Dh, 84h, 28h
                db 10h, 86h, 43h, 25h, 0B2h, 19h, 35h, 0D3h, 0DEh, 0, 5
                db 8
level_56        db 0Eh, 10h, 0F4h, 0D0h, 78h, 0A4h, 11h, 88h, 30h, 4Ah
                db 8, 41h, 5, 2, 10h, 0E8h, 54h, 94h, 0A8h, 22h, 30h, 4Bh
                db 1, 82h, 10h, 42h, 86h, 48h, 51h, 91h, 40h, 68h, 30h
                db 20h, 84h, 0B4h, 10h, 64h, 50h, 1Ah, 8, 86h, 42h, 0Ch
                db 90h, 0C1h, 68h, 32h, 1Fh, 0Ch, 87h, 74h, 0B2h, 1Dh
                db 0C6h, 0CFh, 64h, 0Bh, 7
level_57        db 12h, 0Bh, 0F2h, 9Ch, 3Dh, 82h, 1Ah, 21h, 81h, 60h, 86h
                db 32h, 42h, 21h, 92h, 19h, 0D0h, 83h, 10h, 42h, 22h, 0A1h
                db 9Dh, 8, 3Ah, 19h, 27h, 43h, 2, 22h, 58h, 0A4h, 9Dh
                db 8, 50h, 45h, 2, 10h, 0D6h, 0A5h, 69h, 0ACh, 6, 0Dh
                db 78h, 0A7h, 0C9h, 0, 7, 5
level_58        db 1Bh, 14h, 0F2h, 0CCh, 7Ch, 0E2h, 0DAh, 0Fh, 9Ch, 18h
                db 21h, 6, 0Bh, 7Ch, 0A0h, 0C8h, 0ECh, 63h, 19h, 0Dh, 16h
                db 8Ah, 42h, 2Ch, 67h, 50h, 68h, 32h, 4Bh, 4, 20h, 0BDh
                db 68h, 44h, 34h, 10h, 0B0h, 84h, 18h, 0C6h, 34h, 20h
                db 0D1h, 88h, 32h, 10h, 5Dh, 0ADh, 6, 83h, 21h, 8, 0A2h
                db 8, 31h, 0ADh, 6, 82h, 14h, 0Ah, 0C2h, 0Bh, 0B5h, 4
                db 1Ah, 21h, 10h, 0C0h, 84h, 0A0h, 0C1h, 0Ch, 4, 1Bh, 0Ch
                db 0Ah, 4, 25h, 16h, 88h, 41h, 0B2h, 55h, 2Ah, 96h, 0Ah
                db 44h, 20h, 0D1h, 48h, 3Eh, 4Bh, 1, 6, 83h, 2, 6, 5, 4Ch
                db 12h, 0C4h, 46h, 38h, 20h, 41h, 82h, 98h, 0Ah, 32h, 5Ah
                db 0Ch, 8, 83h, 0E5h, 86h, 43h, 2, 80h, 88h, 60h, 86h
                db 0Eh, 64h, 86h, 9, 60h, 0E7h, 0C8h, 29h, 0F3h, 0C0h
                db 15h, 0Eh
level_59        db 1Dh, 14h, 0F2h, 9Fh, 3Ch, 0D0h, 0C0h, 7Ch, 0F3h, 43h
                db 7, 3Eh, 49h, 0ACh, 7, 3, 0E4h, 86h, 42h, 8, 20h, 83h
                db 24h, 3Eh, 40h, 42h, 0B1h, 41h, 0Ch, 8, 1Fh, 4, 0A1h
                db 10h, 60h, 20h, 0D9h, 0ECh, 6, 5, 1, 81h, 10h, 44h, 40h
                db 0C8h, 41h, 80h, 88h, 41h, 90h, 0D9h, 2Dh, 8, 10h, 60h
                db 20h, 0C0h, 54h, 84h, 4Bh, 1, 80h, 88h, 88h, 30h, 10h
                db 68h, 50h, 85h, 1, 92h, 10h, 0A0h, 20h, 8Ch, 50h, 40h
                db 0D1h, 0Ch, 6, 45h, 44h, 68h, 60h, 34h, 4Ah, 8, 41h
                db 9, 60h, 95h, 9Eh, 1Bh, 21h, 82h, 2Ah, 15h, 90h, 0D6h
                db 86h, 8, 60h, 86h, 45h, 1, 46h, 8, 6Bh, 3Bh, 4Ah, 0Ch
                db 0Ah, 2, 8, 50h, 0C1h, 0Dh, 67h, 6Bh, 44h, 30h, 28h
                db 8, 40h, 0C0h, 6Bh, 3Bh, 4Bh, 1, 0A1h, 0Ah, 64h, 22h
                db 0B3h, 0B4h, 0B4h, 19h, 0Ch, 6, 3, 1, 82h, 33h, 0B4h
                db 0B8h, 73h, 7, 0B0h, 0F0h, 0Dh, 0Dh
level_60        db 1Ah, 10h, 0E2h, 0DFh, 3Ch, 90h, 0C9h, 4Fh, 9Eh, 10h
                db 0A8h, 0A6h, 0Ah, 7Ch, 32h, 10h, 8Ch, 14h, 0C0h, 47h
                db 0B0h, 83h, 22h, 90h, 0C8h, 41h, 8Dh, 61h, 0Ah, 0Ah
                db 41h, 80h, 0C0h, 41h, 8Ch, 0A0h, 32h, 28h, 0Ch, 8, 10h
                db 83h, 42h, 0Bh, 39h, 4, 20h, 84h, 30h, 43h, 41h, 63h
                db 1, 8Ch, 54h, 86h, 48h, 68h, 88h, 16h, 30h, 18h, 0C4h
                db 20h, 0A0h, 41h, 8, 64h, 84h, 31h, 80h, 0B3h, 0C4h, 8
                db 86h, 44h, 0Ah, 21h, 2, 0C6h, 3, 18h, 0E1h, 0Ch, 86h
                db 0C2h, 0C6h, 3, 1Bh, 58h, 25h, 18h, 0B4h, 20h, 88h, 0BCh
                db 0F1h, 0DAh, 58h, 3Dh, 0F6h, 8, 0D6h, 0F9h, 0A6h, 20h
                db 6, 8
barrel_count    db 0
current_barrel  dw 0
barrels:

`;

// docs/examples.ts
var EXAMPLES = [
  { name: "hello", filename: "hello.asm", source: hello_default },
  { name: "ok", filename: "ok.asm", source: ok_default },
  { name: "sections", filename: "sections.asm", source: sections_default },
  { name: "expressions", filename: "expressions.asm", source: expressions_default },
  { name: "$ (current address)", filename: "addr.asm", source: addr_default },
  { name: "local labels (@ and .)", filename: "locals.asm", source: locals_default },
  { name: "if / else (nested)", filename: "ifelse.asm", source: ifelse_default },
  { name: "proc / endp / return", filename: "proc.asm", source: proc_default },
  { name: "proc: .return -> RET (no saves)", filename: "proc-ret.asm", source: proc_ret_default },
  { name: "proc: .return -> JMP exit (with saves)", filename: "proc-jmp.asm", source: proc_jmp_default },
  { name: "sokoban", filename: "sokoban.asm", source: sokoban_default }
];

// docs/build-info.ts
var BUILD_TIME = "2026-04-20 12:12:07";

// docs/playground.ts
var STORAGE_KEY = "asm8-playground:source";
var FILENAME_KEY = "asm8-playground:filename";
var TABS_KEY = "asm8-playground:tabs";
var ACTIVE_KEY = "asm8-playground:active";
var THEME_KEY = "asm8-playground:theme";
var DEFAULT_FILENAME = "program.asm";
var tabs = [];
var active = 0;
function applyTheme(t) {
  document.body.classList.toggle("theme-light", t === "light");
  themeBtn.textContent = t === "light" ? "dark" : "light";
}
function loadTheme() {
  try {
    return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}
function saveTheme(t) {
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch {}
}
var source = document.getElementById("source");
var gutter = document.getElementById("gutter");
var highlight = document.getElementById("highlight");
var errorEl = document.getElementById("error");
var select = document.getElementById("example");
var modal = document.getElementById("modal");
var modalContent = document.getElementById("modal-content");
var confirmModal = document.getElementById("confirm-modal");
var confirmMessage = document.getElementById("confirm-message");
var confirmOk = document.getElementById("confirm-ok");
var confirmCancel = document.getElementById("confirm-cancel");
var uploadBtn = document.getElementById("upload-asm");
var downloadAsmBtn = document.getElementById("download-asm");
var downloadBinBtn = document.getElementById("download-bin");
var runBinBtn = document.getElementById("run-bin");
var resetBtn = document.getElementById("reset");
var themeBtn = document.getElementById("theme");
var fileInput = document.getElementById("file-input");
var filenameInput = document.getElementById("filename");
var tabsEl = document.getElementById("tabs");
function asmName() {
  return filenameInput.value.trim() || DEFAULT_FILENAME;
}
function binName() {
  const n = asmName();
  const base = n.replace(/\.[^.]*$/, "") || n;
  return base + ".bin";
}
var LINE_HEIGHT = 20;
var PAD_TOP = 8;
for (const ex of EXAMPLES) {
  const opt = document.createElement("option");
  opt.value = ex.name;
  opt.textContent = ex.name;
  select.appendChild(opt);
}
select.addEventListener("change", () => {
  const ex = EXAMPLES.find((e) => e.name === select.value);
  if (!ex)
    return;
  tabs[active].source = source.value;
  const uniqueName = uniqueFilename(ex.filename);
  tabs.push({ filename: uniqueName, source: ex.source });
  active = tabs.length - 1;
  source.value = ex.source;
  filenameInput.value = uniqueName;
  lastGoodName = uniqueName;
  source.scrollTop = 0;
  saveTabs();
  renderTabs();
  onChange();
  source.focus();
});
function uniqueFilename(base) {
  if (!tabs.some((t, i) => i !== active && t.filename === base))
    return base;
  const m = base.match(/^(.*?)(\.[^.]*)?$/);
  const stem = m ? m[1] : base;
  const ext = m && m[2] ? m[2] : "";
  let n = 2;
  while (tabs.some((t, i) => i !== active && t.filename === `${stem}-${n}${ext}`))
    n++;
  return `${stem}-${n}${ext}`;
}
function deselectExample() {
  if (select.value)
    select.value = "";
}
source.addEventListener("input", deselectExample);
filenameInput.addEventListener("input", deselectExample);
function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function hex22(n) {
  return n.toString(16).toUpperCase().padStart(2, "0");
}
function hex42(n) {
  return n.toString(16).toUpperCase().padStart(4, "0");
}
function formatDump(display, baseAddr, bytes, perRow) {
  const lines = [];
  const trimmed = display.replace(/^\s+/, "");
  if (trimmed)
    lines.push(trimmed);
  if (lines.length)
    lines.push("");
  for (let i = 0;i < bytes.length; i += perRow) {
    const chunk = bytes.slice(i, i + perRow);
    lines.push(`${hex42(baseAddr + i)}: ${chunk.map(hex22).join(" ")}`);
  }
  return lines.join(`
`);
}
function fmtGutterGroup(rs) {
  if (!rs || rs.length === 0)
    return "";
  const first = rs[0];
  if (!first.prefix)
    return "";
  if (first.prefix.startsWith("=")) {
    return `<span class="equ">${esc(first.prefix)}</span>`;
  }
  const m = first.prefix.match(/^([0-9A-F]{4}):/);
  if (!m)
    return esc(first.prefix);
  const addr = m[1];
  const allBytes = rs.flatMap((r) => r.bytes);
  if (allBytes.length === 0) {
    return `<span class="addr">${addr}:</span>`;
  }
  const head = allBytes.slice(0, 4).map(hex22).join(" ");
  if (allBytes.length <= 4) {
    return `<span class="addr">${addr}:</span> <span class="bytes">${head}</span>`;
  }
  const baseAddr = first.addr ?? parseInt(addr, 16);
  const dump = formatDump(first.display, baseAddr, allBytes, 8);
  return `<span class="addr">${addr}:</span> <span class="bytes">${head}</span>` + `<span class="more" data-dump="${esc(dump)}">…</span>`;
}
function openModal(text) {
  modalContent.textContent = text;
  modal.hidden = false;
}
function closeModal() {
  modal.hidden = true;
}
var confirmResolver = null;
function askConfirm(message) {
  confirmMessage.textContent = message;
  confirmModal.hidden = false;
  confirmOk.focus();
  return new Promise((resolve2) => {
    confirmResolver = resolve2;
  });
}
function closeConfirm(result) {
  confirmModal.hidden = true;
  const r = confirmResolver;
  confirmResolver = null;
  if (r)
    r(result);
}
confirmOk.addEventListener("click", () => closeConfirm(true));
confirmCancel.addEventListener("click", () => closeConfirm(false));
confirmModal.addEventListener("click", (e) => {
  if (e.target === confirmModal)
    closeConfirm(false);
});
gutter.addEventListener("click", (e) => {
  const t = e.target;
  if (!t.classList.contains("more"))
    return;
  const dump = t.getAttribute("data-dump");
  if (dump !== null)
    openModal(dump);
});
modal.addEventListener("click", (e) => {
  if (e.target === modal)
    closeModal();
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (!modal.hidden)
      closeModal();
    else if (!confirmModal.hidden)
      closeConfirm(false);
  }
  if (e.key === "Enter" && !confirmModal.hidden) {
    e.preventDefault();
    closeConfirm(true);
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "r") {
    if (runBinBtn.disabled)
      return;
    e.preventDefault();
    runBinBtn.click();
  }
});
function renderGutter(info, totalLines) {
  const groups = new Map;
  for (const r of info) {
    const arr = groups.get(r.orig);
    if (arr)
      arr.push(r);
    else
      groups.set(r.orig, [r]);
  }
  const out = [];
  for (let i = 1;i <= totalLines; i++) {
    out.push(fmtGutterGroup(groups.get(i)));
  }
  gutter.innerHTML = out.join(`
`);
}
function renderHighlight(errLine) {
  highlight.innerHTML = "";
  if (errLine === null)
    return;
  const div = document.createElement("div");
  div.className = "err-line";
  div.style.position = "absolute";
  div.style.left = "0";
  div.style.right = "0";
  div.style.top = `${PAD_TOP + (errLine - 1) * LINE_HEIGHT - source.scrollTop}px`;
  div.style.height = `${LINE_HEIGHT}px`;
  highlight.appendChild(div);
}
var errLine = null;
var lastSections = null;
function compile() {
  const src = source.value;
  const totalLines = src.length === 0 ? 1 : src.split(`
`).length;
  try {
    const info = lineInfo(src);
    lastSections = asm(src);
    renderGutter(info, totalLines);
    errLine = null;
    renderHighlight(null);
    errorEl.classList.remove("visible");
    errorEl.textContent = "";
    downloadBinBtn.disabled = lastSections.length === 0;
    runBinBtn.disabled = lastSections.length === 0;
  } catch (e) {
    lastSections = null;
    downloadBinBtn.disabled = true;
    runBinBtn.disabled = true;
    if (e instanceof AsmError) {
      errLine = e.line;
      errorEl.classList.add("visible");
      errorEl.textContent = `line ${e.line}: ${e.message}`;
    } else {
      errLine = null;
      errorEl.classList.add("visible");
      errorEl.textContent = e.message;
    }
    gutter.innerHTML = "";
    renderHighlight(errLine);
  }
}
function saveTabs() {
  try {
    localStorage.setItem(TABS_KEY, JSON.stringify(tabs));
    localStorage.setItem(ACTIVE_KEY, String(active));
  } catch {}
}
function save() {
  tabs[active].source = source.value;
  saveTabs();
}
function renderTabs() {
  tabsEl.innerHTML = "";
  tabs.forEach((t, i) => {
    const el = document.createElement("div");
    el.className = "tab" + (i === active ? " active" : "");
    el.title = t.filename;
    const name = document.createElement("span");
    name.textContent = t.filename || "(untitled)";
    el.appendChild(name);
    const close = document.createElement("button");
    close.type = "button";
    close.className = "close";
    close.textContent = "×";
    close.title = "close tab";
    close.addEventListener("click", (e) => {
      e.stopPropagation();
      closeTab(i);
    });
    el.appendChild(close);
    el.addEventListener("click", () => switchTab(i));
    tabsEl.appendChild(el);
  });
  const add = document.createElement("button");
  add.type = "button";
  add.className = "tab-add";
  add.textContent = "+";
  add.title = "new tab";
  add.addEventListener("click", () => newTab());
  tabsEl.appendChild(add);
}
function nextUntitled() {
  let n = 1;
  while (tabs.some((t) => t.filename === `untitled-${n}.asm`))
    n++;
  return `untitled-${n}.asm`;
}
function switchTab(i) {
  if (i === active || i < 0 || i >= tabs.length)
    return;
  tabs[active].source = source.value;
  active = i;
  source.value = tabs[active].source;
  filenameInput.value = tabs[active].filename;
  source.scrollTop = 0;
  saveTabs();
  renderTabs();
  deselectExample();
  compile();
  syncScroll();
  source.focus();
}
function newTab() {
  tabs[active].source = source.value;
  tabs.push({ filename: nextUntitled(), source: "" });
  active = tabs.length - 1;
  source.value = "";
  filenameInput.value = tabs[active].filename;
  source.scrollTop = 0;
  saveTabs();
  renderTabs();
  deselectExample();
  compile();
  syncScroll();
  source.focus();
}
async function closeTab(i) {
  const current = i === active ? source.value : tabs[i].source;
  if (current.trim().length > 0) {
    const ok = await askConfirm(`Close "${tabs[i].filename}"? Its content will be lost.`);
    if (!ok)
      return;
  }
  if (tabs.length === 1) {
    tabs[0] = { filename: DEFAULT_FILENAME, source: "" };
    active = 0;
    source.value = "";
    filenameInput.value = tabs[0].filename;
    lastGoodName = tabs[0].filename;
  } else {
    tabs.splice(i, 1);
    if (active > i)
      active--;
    else if (active === i && active >= tabs.length)
      active = tabs.length - 1;
    source.value = tabs[active].source;
    filenameInput.value = tabs[active].filename;
    lastGoodName = tabs[active].filename;
  }
  saveTabs();
  renderTabs();
  deselectExample();
  compile();
  syncScroll();
}
var lastGoodName = "";
filenameInput.addEventListener("focus", () => {
  lastGoodName = filenameInput.value;
});
filenameInput.addEventListener("input", () => {
  tabs[active].filename = filenameInput.value;
  saveTabs();
  renderTabs();
});
filenameInput.addEventListener("change", () => {
  const val = filenameInput.value.trim();
  const dup = tabs.findIndex((t, i) => i !== active && t.filename === val);
  if (!val || dup !== -1) {
    if (dup !== -1)
      alert(`A tab named "${val}" already exists.`);
    filenameInput.value = lastGoodName;
    tabs[active].filename = lastGoodName;
  } else {
    filenameInput.value = val;
    tabs[active].filename = val;
    lastGoodName = val;
  }
  saveTabs();
  renderTabs();
});
function syncScroll() {
  gutter.style.transform = `translateY(${-source.scrollTop}px)`;
  if (errLine !== null)
    renderHighlight(errLine);
}
function onChange() {
  save();
  compile();
  syncScroll();
}
source.addEventListener("input", onChange);
source.addEventListener("scroll", syncScroll);
window.addEventListener("resize", syncScroll);
function downloadBlob(data, name, type) {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
function findOverlap(sections) {
  const sorted = [...sections].sort((a, b) => a.start - b.start);
  for (let i = 1;i < sorted.length; i++) {
    if (sorted[i].start <= sorted[i - 1].end)
      return [sorted[i - 1], sorted[i]];
  }
  return null;
}
function flattenSections(sections) {
  if (sections.length === 0)
    return new Uint8Array(0);
  const maxEnd = sections.reduce((m, s) => Math.max(m, s.end), 0);
  const buf = new Uint8Array(maxEnd + 1);
  for (const s of sections)
    buf.set(s.data, s.start);
  return buf;
}
downloadAsmBtn.addEventListener("click", () => {
  downloadBlob(source.value, asmName(), "text/plain");
});
function buildBin() {
  if (!lastSections || lastSections.length === 0)
    return null;
  const overlap = findOverlap(lastSections);
  if (overlap) {
    const [a, b] = overlap;
    alert(`sections overlap: ${hex42(a.start)}-${hex42(a.end)} and ${hex42(b.start)}-${hex42(b.end)}`);
    return null;
  }
  return flattenSections(lastSections);
}
function toBase64(bytes) {
  let s = "";
  for (let i = 0;i < bytes.length; i++)
    s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
downloadBinBtn.addEventListener("click", () => {
  const bin = buildBin();
  if (!bin)
    return;
  downloadBlob(bin, binName(), "application/octet-stream");
});
runBinBtn.addEventListener("click", () => {
  const bin = buildBin();
  if (!bin)
    return;
  const dataUrl = `data:;name=${binName()};base64,${toBase64(bin)}`;
  const runUrl = `https://rk86.ru/beta/index.html?run=${encodeURIComponent(dataUrl)}`;
  window.open(runUrl, "_blank", "noopener");
});
uploadBtn.addEventListener("click", () => fileInput.click());
resetBtn.addEventListener("click", async () => {
  const ok = await askConfirm("Reset the current tab to the 'hello' example? This replaces its content.");
  if (!ok)
    return;
  const def = EXAMPLES.find((e) => e.name === "hello");
  if (!def)
    return;
  const uniqueName = uniqueFilename(def.filename);
  tabs[active] = { filename: uniqueName, source: def.source };
  source.value = def.source;
  filenameInput.value = uniqueName;
  lastGoodName = uniqueName;
  select.value = def.name;
  source.scrollTop = 0;
  saveTabs();
  renderTabs();
  onChange();
  source.focus();
});
fileInput.addEventListener("change", async () => {
  const f = fileInput.files?.[0];
  if (!f)
    return;
  const text = await f.text();
  const uniqueName = uniqueFilename(f.name);
  tabs.push({ filename: uniqueName, source: text });
  active = tabs.length - 1;
  source.value = text;
  filenameInput.value = uniqueName;
  lastGoodName = uniqueName;
  source.scrollTop = 0;
  fileInput.value = "";
  saveTabs();
  renderTabs();
  onChange();
  source.focus();
});
var buildTimeEl = document.getElementById("build-time");
if (buildTimeEl && BUILD_TIME)
  buildTimeEl.textContent = `build ${BUILD_TIME}`;
themeBtn.addEventListener("click", () => {
  const next = document.body.classList.contains("theme-light") ? "dark" : "light";
  applyTheme(next);
  saveTheme(next);
});
applyTheme(loadTheme());
function loadTabsFromStorage() {
  try {
    const raw = localStorage.getItem(TABS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        tabs = parsed.map((t) => ({
          filename: String(t.filename ?? DEFAULT_FILENAME),
          source: String(t.source ?? "")
        }));
        const a = Number(localStorage.getItem(ACTIVE_KEY) ?? 0) | 0;
        active = a < 0 || a >= tabs.length ? 0 : a;
        return;
      }
    }
  } catch {}
  let src = "";
  let name = "";
  try {
    src = localStorage.getItem(STORAGE_KEY) ?? "";
    name = localStorage.getItem(FILENAME_KEY) ?? "";
  } catch {}
  if (!src)
    src = EXAMPLES[0]?.source ?? "";
  if (!name)
    name = EXAMPLES[0]?.filename ?? DEFAULT_FILENAME;
  tabs = [{ filename: name, source: src }];
  active = 0;
  saveTabs();
}
loadTabsFromStorage();
source.value = tabs[active].source;
filenameInput.value = tabs[active].filename;
lastGoodName = tabs[active].filename;
renderTabs();
onChange();
