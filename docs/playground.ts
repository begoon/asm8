import { asm, AsmError, lineInfo, type LineInfo, type Section } from "../asm8";
import { BUILD_TIME } from "./build-info";
import { tabIncludeOptions } from "./tab-includes";

// The "Example" dropdown is populated from a runtime-loaded manifest —
// docs/examples.js defines `window.asm8Examples` as
// `[{ name, filename }, ...]` and is loaded by a classic `<script>` tag
// before this module runs. Each entry's `source` is a Promise kicked off
// immediately so tab-switching feels instant.
interface Example {
  name: string;
  filename: string;
  source: Promise<string>;
  resolvedSource?: string;
}
interface ExampleManifestEntry {
  name: string;
  filename: string;
}
declare global {
  interface Window {
    asm8Examples?: ExampleManifestEntry[];
  }
}

const fetchExample = (f: string): Promise<string> =>
  fetch(`examples/${f}`).then((r) => r.text());

const EXAMPLES: Example[] = (window.asm8Examples ?? []).map((e) => {
  const ex: Example = {
    name: e.name,
    filename: e.filename,
    source: fetchExample(e.filename),
  };
  ex.source.then(
    (s) => {
      ex.resolvedSource = s;
      renderTabs();
    },
    () => {},
  );
  return ex;
});

function tabMatchesExample(t: Tab): boolean {
  const ex = EXAMPLES.find((e) => e.filename === t.filename);
  return !!ex && ex.resolvedSource === t.source;
}

const STORAGE_KEY = "asm8-playground:source";
const FILENAME_KEY = "asm8-playground:filename";
const TABS_KEY = "asm8-playground:tabs";
const ACTIVE_KEY = "asm8-playground:active";
const THEME_KEY = "asm8-playground:theme";
const FORMAT_KEY = "asm8-playground:format";
const DEFAULT_FILENAME = "program.asm";

type OutputFormat = "asm" | "bin" | "rk" | "rkr" | "rks" | "pki" | "gam";
const OUTPUT_FORMATS: readonly OutputFormat[] = [
  "asm",
  "bin",
  "rk",
  "rkr",
  "rks",
  "pki",
  "gam",
];
const DEFAULT_FORMAT: OutputFormat = "asm";

interface Tab {
  filename: string;
  source: string;
  // Per-tab caret/viewport, restored when the tab is shown again.
  selectionStart?: number;
  selectionEnd?: number;
  scrollTop?: number;
  scrollLeft?: number;
}

let tabs: Tab[] = [];
let active = 0;

type Theme = "dark" | "light";

function applyTheme(t: Theme) {
  document.body.classList.toggle("theme-light", t === "light");
  themeBtn.textContent = t === "light" ? "dark" : "light";
}

function loadTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function saveTheme(t: Theme) {
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch {}
}

const source = document.getElementById("source") as HTMLTextAreaElement;
const gutter = document.getElementById("gutter") as HTMLDivElement;
const highlight = document.getElementById("highlight") as HTMLDivElement;
const hlText = document.getElementById("hl-text") as HTMLPreElement;
const errorEl = document.getElementById("error") as HTMLDivElement;
const select = document.getElementById("example") as HTMLSelectElement;
const modal = document.getElementById("modal") as HTMLDivElement;
const modalContent = document.getElementById("modal-content") as HTMLPreElement;
const confirmModal = document.getElementById("confirm-modal") as HTMLDivElement;
const confirmMessage = document.getElementById(
  "confirm-message",
) as HTMLParagraphElement;
const confirmOk = document.getElementById("confirm-ok") as HTMLButtonElement;
const confirmCancel = document.getElementById(
  "confirm-cancel",
) as HTMLButtonElement;
const loadEmuBtn = document.getElementById("load-emu") as HTMLButtonElement;
const uploadBtn = document.getElementById("upload-asm") as HTMLButtonElement;
const fileInput = document.getElementById("file-input") as HTMLInputElement;
const downloadBtn = document.getElementById(
  "download-btn",
) as HTMLButtonElement;
const downloadFormatSel = document.getElementById(
  "download-format",
) as HTMLSelectElement;
const runBinBtn = document.getElementById("run-bin") as HTMLButtonElement;
const resetBtn = document.getElementById("reset") as HTMLButtonElement;
const themeBtn = document.getElementById("theme") as HTMLButtonElement;
const filenameInput = document.getElementById("filename") as HTMLInputElement;
const tabsEl = document.getElementById("tabs") as HTMLDivElement;

function asmName(): string {
  return filenameInput.value.trim() || DEFAULT_FILENAME;
}

// Snapshot the live editor (text, caret, scroll) into the active tab.
function captureView() {
  const t = tabs[active];
  if (!t) return;
  t.source = source.value;
  t.selectionStart = source.selectionStart;
  t.selectionEnd = source.selectionEnd;
  t.scrollTop = source.scrollTop;
  t.scrollLeft = source.scrollLeft;
}

// Load a tab into the editor and restore its caret + scroll position.
// Setting `value` parks the caret at the end and a later `focus()` would
// scroll there, so the selection is set explicitly and the scroll offsets
// are applied last.
function showTab(t: Tab) {
  source.value = t.source;
  filenameInput.value = t.filename;
  lastGoodName = t.filename;
  const len = source.value.length;
  const start = Math.min(t.selectionStart ?? 0, len);
  const end = Math.min(t.selectionEnd ?? start, len);
  source.setSelectionRange(start, end);
  source.focus({ preventScroll: true });
  source.scrollTop = t.scrollTop ?? 0;
  source.scrollLeft = t.scrollLeft ?? 0;
}

function outputName(format: OutputFormat): string {
  const n = asmName();
  const base = n.replace(/\.[^.]*$/, "") || n;
  return `${base}.${format}`;
}

// Ported from rk86-js-v2-svelte/src/lib/core/rk86_check_sum.ts.
// Two-byte (big-endian) checksum used in Radio-86RK tape files.
function rk86CheckSum(v: number[] | Uint8Array): number {
  let sum = 0;
  let j = 0;
  while (j < v.length - 1) {
    const c = v[j];
    sum = (sum + c + (c << 8)) & 0xffff;
    j += 1;
  }
  const sum_h = sum & 0xff00;
  const sum_l = sum & 0xff;
  sum = sum_h | ((sum_l + v[j]) & 0xff);
  return sum;
}

// Produce the output file covering min(start)..max(end) of the sections.
// Gaps between sections are zero-filled; origin is encoded in the header so
// an `org 3000h` program doesn't carry 3000h leading zero bytes.
//   bin        -> raw payload (tight, no leading zero fill)
//   rk, rkr    -> [start_hi, start_lo, end_hi, end_lo] + payload + [E6, cs_hi, cs_lo]
//   rks        -> [start_lo, start_hi, end_lo, end_hi] + payload + [cs_lo, cs_hi]
//   pki, gam   -> leading E6 sync byte + the rk layout
function buildOutputFile(
  sections: Section[],
  format: OutputFormat,
): Uint8Array {
  if (sections.length === 0) return new Uint8Array(0);
  const start = sections.reduce((m, s) => Math.min(m, s.start), Infinity);
  const end = sections.reduce((m, s) => Math.max(m, s.end), 0);
  const size = end - start + 1;
  const payload = new Uint8Array(size);
  for (const s of sections) payload.set(s.data, s.start - start);
  if (format === "bin") return payload;
  const checksum = rk86CheckSum(payload);
  if (format === "rks") {
    const out = new Uint8Array(4 + size + 2);
    const view = new DataView(out.buffer);
    view.setUint16(0, start, true);
    view.setUint16(2, end, true);
    out.set(payload, 4);
    view.setUint16(4 + size, checksum, true);
    return out;
  }
  const hasSync = format === "pki" || format === "gam";
  const headerLen = hasSync ? 5 : 4;
  const out = new Uint8Array(headerLen + size + 3);
  let o = 0;
  if (hasSync) out[o++] = 0xe6;
  out[o++] = (start >> 8) & 0xff;
  out[o++] = start & 0xff;
  out[o++] = (end >> 8) & 0xff;
  out[o++] = end & 0xff;
  out.set(payload, o);
  o += size;
  out[o++] = 0xe6;
  out[o++] = (checksum >> 8) & 0xff;
  out[o++] = checksum & 0xff;
  return out;
}

const LINE_HEIGHT = 20;
const PAD_TOP = 8;

for (const ex of EXAMPLES) {
  const opt = document.createElement("option");
  opt.value = ex.name;
  opt.textContent = ex.name;
  select.appendChild(opt);
}

select.addEventListener("change", async () => {
  const ex = EXAMPLES.find((e) => e.name === select.value);
  if (!ex) return;
  const exSource = await ex.source;
  captureView();
  const uniqueName = uniqueFilename(ex.filename);
  tabs.push({ filename: uniqueName, source: exSource });
  active = tabs.length - 1;
  showTab(tabs[active]);
  saveTabs();
  renderTabs();
  onChange();
});

function uniqueFilename(base: string): string {
  if (!tabs.some((t, i) => i !== active && t.filename === base)) return base;
  const m = base.match(/^(.*?)(\.[^.]*)?$/);
  const stem = m ? m[1] : base;
  const ext = m && m[2] ? m[2] : "";
  let n = 2;
  while (
    tabs.some((t, i) => i !== active && t.filename === `${stem}-${n}${ext}`)
  )
    n++;
  return `${stem}-${n}${ext}`;
}

function deselectExample() {
  if (select.value) select.value = "";
}

source.addEventListener("input", deselectExample);
filenameInput.addEventListener("input", deselectExample);

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function hex2(n: number): string {
  return n.toString(16).toUpperCase().padStart(2, "0");
}

function hex4(n: number): string {
  return n.toString(16).toUpperCase().padStart(4, "0");
}

function formatDump(
  display: string,
  baseAddr: number,
  bytes: number[],
  perRow: number,
): string {
  const lines: string[] = [];
  const trimmed = display.replace(/^\s+/, "");
  if (trimmed) lines.push(trimmed);
  if (lines.length) lines.push("");
  for (let i = 0; i < bytes.length; i += perRow) {
    const chunk = bytes.slice(i, i + perRow);
    lines.push(`${hex4(baseAddr + i)}: ${chunk.map(hex2).join(" ")}`);
  }
  return lines.join("\n");
}

function fmtGutterGroup(rs: LineInfo[] | undefined): string {
  if (!rs || rs.length === 0) return "";
  const first = rs[0];
  if (!first.prefix) return "";
  if (first.prefix.startsWith("=")) {
    return `<span class="equ">${esc(first.prefix)}</span>`;
  }
  const m = first.prefix.match(/^([0-9A-F]{4}):/);
  if (!m) return esc(first.prefix);
  const addr = m[1];
  const allBytes = rs.flatMap((r) => r.bytes);
  if (allBytes.length === 0) {
    return `<span class="addr">${addr}:</span>`;
  }
  const head = allBytes.slice(0, 4).map(hex2).join(" ");
  if (allBytes.length <= 4) {
    return `<span class="addr">${addr}:</span> <span class="bytes">${head}</span>`;
  }
  const baseAddr = first.addr ?? parseInt(addr, 16);
  const dump = formatDump(first.display, baseAddr, allBytes, 8);
  return (
    `<span class="addr">${addr}:</span> <span class="bytes">${head}</span>` +
    `<span class="more" data-dump="${esc(dump)}">…</span>`
  );
}

function openModal(text: string) {
  modalContent.textContent = text;
  modal.hidden = false;
}

function closeModal() {
  modal.hidden = true;
}

let confirmResolver: ((ok: boolean) => void) | null = null;

function askConfirm(message: string): Promise<boolean> {
  confirmMessage.textContent = message;
  confirmModal.hidden = false;
  confirmOk.focus();
  return new Promise((resolve) => {
    confirmResolver = resolve;
  });
}

function closeConfirm(result: boolean) {
  confirmModal.hidden = true;
  const r = confirmResolver;
  confirmResolver = null;
  if (r) r(result);
}

confirmOk.addEventListener("click", () => closeConfirm(true));
confirmCancel.addEventListener("click", () => closeConfirm(false));
confirmModal.addEventListener("click", (e) => {
  if (e.target === confirmModal) closeConfirm(false);
});

gutter.addEventListener("click", (e) => {
  const t = e.target as HTMLElement;
  if (!t.classList.contains("more")) return;
  const dump = t.getAttribute("data-dump");
  if (dump !== null) openModal(dump);
});

modal.addEventListener("click", (e) => {
  if (e.target === modal) closeModal();
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (!modal.hidden) closeModal();
    else if (!confirmModal.hidden) closeConfirm(false);
  }
  if (e.key === "Enter" && !confirmModal.hidden) {
    e.preventDefault();
    closeConfirm(true);
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "e") {
    if (runBinBtn.disabled) return;
    e.preventDefault();
    runBinBtn.click();
  }
});

function renderGutter(info: LineInfo[], totalLines: number) {
  const groups = new Map<number, LineInfo[]>();
  for (const r of info) {
    const arr = groups.get(r.orig);
    if (arr) arr.push(r);
    else groups.set(r.orig, [r]);
  }
  const width = String(Math.max(totalLines, 1)).length;
  const out: string[] = [];
  for (let i = 1; i <= totalLines; i++) {
    const num = String(i).padStart(width, " ");
    const body = fmtGutterGroup(groups.get(i));
    out.push(`<span class="lineno">${num}</span>` + (body ? body : ""));
  }
  gutter.innerHTML = out.join("\n");
}

function renderHighlight(errLine: number | null) {
  highlight.innerHTML = "";
  if (errLine === null) return;
  const div = document.createElement("div");
  div.className = "err-line";
  div.style.position = "absolute";
  div.style.left = "0";
  div.style.right = "0";
  div.style.top = `${PAD_TOP + (errLine - 1) * LINE_HEIGHT}px`;
  div.style.height = `${LINE_HEIGHT}px`;
  highlight.appendChild(div);
}

const MNEMONICS = new Set([
  "mov",
  "mvi",
  "lxi",
  "lda",
  "sta",
  "lhld",
  "shld",
  "ldax",
  "stax",
  "xchg",
  "push",
  "pop",
  "xthl",
  "sphl",
  "add",
  "adc",
  "sub",
  "sbb",
  "ana",
  "ora",
  "xra",
  "cmp",
  "adi",
  "aci",
  "sui",
  "sbi",
  "ani",
  "ori",
  "xri",
  "cpi",
  "inr",
  "dcr",
  "inx",
  "dcx",
  "dad",
  "daa",
  "rlc",
  "rrc",
  "ral",
  "rar",
  "cma",
  "cmc",
  "stc",
  "jmp",
  "jnz",
  "jz",
  "jnc",
  "jc",
  "jpo",
  "jpe",
  "jp",
  "jm",
  "pchl",
  "call",
  "cnz",
  "cz",
  "cnc",
  "cc",
  "cpo",
  "cpe",
  "cp",
  "cm",
  "ret",
  "rnz",
  "rz",
  "rnc",
  "rc",
  "rpo",
  "rpe",
  "rp",
  "rm",
  "rst",
  "ei",
  "di",
  "nop",
  "hlt",
  "in",
  "out",
]);
const REGISTERS = new Set([
  "a",
  "b",
  "c",
  "d",
  "e",
  "h",
  "l",
  "m",
  "sp",
  "psw",
]);
const DIRECTIVES = new Set([
  "org",
  "equ",
  "db",
  "dw",
  "ds",
  "end",
  "section",
  "include",
  "if",
  "else",
  "endif",
  "proc",
  "endp",
  "return",
  "low",
  "high",
]);

function highlightLine(line: string): string {
  let out = "";
  let i = 0;
  let firstTok = true;
  const n = line.length;
  while (i < n) {
    const c = line[i];
    if (c === " " || c === "\t") {
      let j = i;
      while (j < n && (line[j] === " " || line[j] === "\t")) j++;
      out += esc(line.slice(i, j));
      i = j;
      continue;
    }
    if (c === ";") {
      out += `<span class="tok-comment">${esc(line.slice(i))}</span>`;
      return out;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < n) {
        if (line[j] === "\\" && j + 1 < n) {
          j += 2;
          continue;
        }
        if (line[j] === c) {
          j++;
          break;
        }
        j++;
      }
      out += `<span class="tok-string">${esc(line.slice(i, j))}</span>`;
      i = j;
      firstTok = false;
      continue;
    }
    if (c === "$" && !/[A-Za-z0-9_]/.test(line[i + 1] ?? "")) {
      out += `<span class="tok-number">$</span>`;
      i++;
      firstTok = false;
      continue;
    }
    if (c >= "0" && c <= "9") {
      const nm =
        /^(?:0[xX][0-9a-fA-F]+|[0-9][0-9a-fA-F]*[hH]|[01]+[bB]|[0-9]+)/.exec(
          line.slice(i),
        );
      if (nm) {
        out += `<span class="tok-number">${esc(nm[0])}</span>`;
        i += nm[0].length;
        firstTok = false;
        continue;
      }
    }
    const idm = /^[@.]?[A-Za-z_][A-Za-z0-9_]*/.exec(line.slice(i));
    if (idm) {
      const word = idm[0];
      const after = i + word.length;
      const lower = word.toLowerCase();
      const stripped = lower.replace(/^[.@]/, "");
      if (line[after] === ":") {
        out += `<span class="tok-label">${esc(word + ":")}</span>`;
        i = after + 1;
        firstTok = false;
        continue;
      }
      let cls: string;
      if (word.startsWith(".") && DIRECTIVES.has(stripped))
        cls = "tok-directive";
      else if (MNEMONICS.has(lower)) cls = "tok-mnemonic";
      else if (firstTok && DIRECTIVES.has(stripped)) cls = "tok-directive";
      else if (DIRECTIVES.has(stripped)) cls = "tok-directive";
      else if (REGISTERS.has(lower)) cls = "tok-register";
      else if (word.startsWith("@") || word.startsWith(".")) cls = "tok-label";
      else if (firstTok) cls = "tok-label";
      else cls = "tok-ident";
      out += `<span class="${cls}">${esc(word)}</span>`;
      i += word.length;
      firstTok = false;
      continue;
    }
    const pm = /^[<>=!&|^~+\-*/%(),:\[\]\\]/.exec(line.slice(i));
    if (pm) {
      out += `<span class="tok-punct">${esc(pm[0])}</span>`;
      i += pm[0].length;
      firstTok = false;
      continue;
    }
    out += esc(c);
    i++;
    firstTok = false;
  }
  return out;
}

function renderHighlightText(src: string) {
  const lines = src.split("\n");
  hlText.innerHTML = lines.map(highlightLine).join("\n");
}

let errLine: number | null = null;
let lastSections: Section[] | null = null;

function compile() {
  captureView();
  const src = source.value;
  const file = asmName();
  const opts = tabIncludeOptions(
    tabs.map((tab, i) =>
      i === active ? { filename: file, source: src } : tab,
    ),
    file,
  );
  const totalLines = src.length === 0 ? 1 : src.split("\n").length;
  renderHighlightText(src);
  try {
    const info = lineInfo(src, opts);
    lastSections = asm(src, opts);
    renderGutter(
      info.filter((row) => row.file === file),
      totalLines,
    );
    errLine = null;
    renderHighlight(null);
    errorEl.classList.remove("visible");
    errorEl.textContent = "";
    updateDownloadEnabled();
    runBinBtn.disabled = lastSections.length === 0;
    loadEmuBtn.disabled = lastSections.length === 0;
  } catch (e) {
    lastSections = null;
    updateDownloadEnabled();
    runBinBtn.disabled = true;
    loadEmuBtn.disabled = true;
    if (e instanceof AsmError) {
      errLine = !e.file || e.file === file ? e.line : null;
      errorEl.classList.add("visible");
      errorEl.textContent = `${e.file ?? file}:${e.line}: ${e.message}`;
    } else {
      errLine = null;
      errorEl.classList.add("visible");
      errorEl.textContent = (e as Error).message;
    }
    renderGutter([], totalLines);
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
  captureView();
  saveTabs();
}

function renderTabs() {
  tabsEl.innerHTML = "";
  tabs.forEach((t, i) => {
    const el = document.createElement("div");
    const live = i === active ? source.value : t.source;
    const matches = tabMatchesExample({ filename: t.filename, source: live });
    el.className =
      "tab" +
      (i === active ? " active" : "") +
      (matches ? " example" : " modified");
    el.title = t.filename;
    const name = document.createElement("span");
    name.textContent = t.filename || "(untitled)";
    el.appendChild(name);
    const close = document.createElement("button");
    close.type = "button";
    close.className = "close";
    close.textContent = "\u00d7";
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

function nextUntitled(): string {
  let n = 1;
  while (tabs.some((t) => t.filename === `untitled-${n}.asm`)) n++;
  return `untitled-${n}.asm`;
}

function switchTab(i: number) {
  if (i === active || i < 0 || i >= tabs.length) return;
  captureView();
  active = i;
  showTab(tabs[active]);
  saveTabs();
  renderTabs();
  deselectExample();
  compile();
  syncScroll();
}

function newTab() {
  captureView();
  tabs.push({ filename: nextUntitled(), source: "" });
  active = tabs.length - 1;
  showTab(tabs[active]);
  saveTabs();
  renderTabs();
  deselectExample();
  compile();
  syncScroll();
}

async function closeTab(i: number) {
  const current = i === active ? source.value : tabs[i].source;
  const matchesExample = tabMatchesExample({
    filename: tabs[i].filename,
    source: current,
  });
  if (current.trim().length > 0 && !matchesExample) {
    const ok = await askConfirm(
      `Close "${tabs[i].filename}"? Its content will be lost.`,
    );
    if (!ok) return;
  }
  if (i !== active) captureView();
  if (tabs.length === 1) {
    tabs[0] = { filename: DEFAULT_FILENAME, source: "" };
    active = 0;
  } else {
    tabs.splice(i, 1);
    if (active > i) active--;
    else if (active === i && active >= tabs.length) active = tabs.length - 1;
  }
  showTab(tabs[active]);
  saveTabs();
  renderTabs();
  deselectExample();
  compile();
  syncScroll();
}

let lastGoodName = "";
filenameInput.addEventListener("focus", () => {
  lastGoodName = filenameInput.value;
});
filenameInput.addEventListener("input", () => {
  tabs[active].filename = filenameInput.value;
  saveTabs();
  renderTabs();
  compile();
});
filenameInput.addEventListener("change", () => {
  const val = filenameInput.value.trim();
  const dup = tabs.findIndex((t, i) => i !== active && t.filename === val);
  if (!val || dup !== -1) {
    if (dup !== -1) alert(`A tab named "${val}" already exists.`);
    filenameInput.value = lastGoodName;
    tabs[active].filename = lastGoodName;
  } else {
    filenameInput.value = val;
    tabs[active].filename = val;
    lastGoodName = val;
  }
  saveTabs();
  renderTabs();
  compile();
});

function syncScroll() {
  const dx = -source.scrollLeft;
  const dy = -source.scrollTop;
  gutter.style.transform = `translateY(${dy}px)`;
  hlText.style.transform = `translate(${dx}px, ${dy}px)`;
  highlight.style.transform = `translateY(${dy}px)`;
}

function onChange() {
  save();
  compile();
  syncScroll();
  renderTabs();
}

source.addEventListener("input", onChange);
source.addEventListener("keydown", (e) => {
  if (
    e.key !== "Tab" ||
    e.shiftKey ||
    e.ctrlKey ||
    e.metaKey ||
    e.altKey ||
    e.isComposing
  ) {
    return;
  }

  e.preventDefault();
  // Native insertion preserves undo history and fires the input event.
  if (!document.execCommand("insertText", false, "\t")) {
    source.setRangeText(
      "\t",
      source.selectionStart,
      source.selectionEnd,
      "end",
    );
    onChange();
  }
});
source.addEventListener("scroll", syncScroll);
window.addEventListener("resize", syncScroll);

function downloadBlob(data: BlobPart, name: string, type: string) {
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

function findOverlap(sections: Section[]): [Section, Section] | null {
  const sorted = [...sections].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start <= sorted[i - 1].end) return [sorted[i - 1], sorted[i]];
  }
  return null;
}

function buildOutput(format: OutputFormat): Uint8Array | null {
  if (!lastSections || lastSections.length === 0) return null;
  const overlap = findOverlap(lastSections);
  if (overlap) {
    const [a, b] = overlap;
    alert(
      `sections overlap: ${hex4(a.start)}-${hex4(a.end)} and ${hex4(b.start)}-${hex4(b.end)}`,
    );
    return null;
  }
  return buildOutputFile(lastSections, format);
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function loadFormat(): OutputFormat {
  try {
    const v = localStorage.getItem(FORMAT_KEY);
    if (v && (OUTPUT_FORMATS as readonly string[]).includes(v)) {
      return v as OutputFormat;
    }
  } catch {}
  return DEFAULT_FORMAT;
}

function saveFormat(f: OutputFormat) {
  try {
    localStorage.setItem(FORMAT_KEY, f);
  } catch {}
}

function selectedFormat(): OutputFormat {
  return downloadFormatSel.value as OutputFormat;
}

// .asm is always available (downloads source); binary formats require a
// successful assembly (i.e., non-empty lastSections).
function updateDownloadEnabled() {
  const fmt = selectedFormat();
  downloadBtn.disabled =
    fmt !== "asm" && (!lastSections || lastSections.length === 0);
}

downloadFormatSel.value = loadFormat();
updateDownloadEnabled();
downloadFormatSel.addEventListener("change", () => {
  saveFormat(selectedFormat());
  updateDownloadEnabled();
});

downloadBtn.addEventListener("click", () => {
  const fmt = selectedFormat();
  if (fmt === "asm") {
    downloadBlob(source.value, asmName(), "text/plain");
    return;
  }
  const data = buildOutput(fmt);
  if (!data) return;
  downloadBlob(data, outputName(fmt), "application/octet-stream");
});

// The emulator's autoload handlers expect the .rk tape envelope, so
// Run always produces .rk regardless of the download-format dropdown.
//
// Two delivery paths:
//
// 1. Same-origin embed (e.g. the rk86-js-v2-svelte mirror at /asm/):
//    we stash the .rk data-URL in localStorage under
//    `asm8-handoff:<uuid>` and open the emulator with `?handoff=<uuid>`.
//    The emulator's boot.ts reads and deletes the key one-shot. This
//    avoids Chrome's ~2 MB URL-length cap (HTTP 431) for large
//    programs.
//
// 2. Cross-origin (standalone asm8 playground targeting rk86.ru):
//    we fall back to `?run=<dataUrl>`. Works up to the browser's URL
//    length limit.
//
// The target emulator URL defaults to rk86.ru; a same-origin embed
// can override it via `window.asm8EmulatorUrl = "../"` in index.html
// (before the playground.js <script type="module"> tag).
const EMULATOR_URL_DEFAULT = "https://rk86.ru/";
const EMULATOR_URL =
  (window as unknown as { asm8EmulatorUrl?: string }).asm8EmulatorUrl ??
  EMULATOR_URL_DEFAULT;

const HANDOFF_PREFIX = "asm8-handoff:";
const HANDOFF_TTL_MS = 60 * 60 * 1000;

function sweepStaleHandoffs() {
  try {
    const now = Date.now();
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(HANDOFF_PREFIX)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const { ts } = JSON.parse(raw) as { ts?: number };
        if (!ts || now - ts > HANDOFF_TTL_MS) localStorage.removeItem(key);
      } catch {
        localStorage.removeItem(key);
      }
    }
  } catch {}
}

function newHandoffId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

// Hand the assembled .rk off to the emulator. `mode` selects what the
// emulator does on arrival: "run" boots it, "load" only loads it into
// memory. For same-origin embeds the data-URL is stashed in
// localStorage (see sweepStaleHandoffs) and the mode is carried as the
// query param name (?handoff= / ?loadoff=); cross-origin passes the
// data-URL directly as ?run= / ?load=.
function sendToEmulator(mode: "run" | "load") {
  const rk = buildOutput("rk");
  if (!rk) return;
  const target = new URL(EMULATOR_URL, location.href);
  const dataUrl = `data:;name=${outputName("rk")};base64,${toBase64(rk)}`;

  if (target.origin === location.origin) {
    sweepStaleHandoffs();
    const id = newHandoffId();
    try {
      localStorage.setItem(
        HANDOFF_PREFIX + id,
        JSON.stringify({ ts: Date.now(), url: dataUrl }),
      );
    } catch (e) {
      alert(
        `localStorage unavailable, cannot hand off to emulator: ${(e as Error).message}`,
      );
      return;
    }
    target.searchParams.set(mode === "run" ? "handoff" : "loadoff", id);
  } else {
    target.searchParams.set(mode, dataUrl);
  }
  window.open(target.toString(), "_blank", "noopener");
}

runBinBtn.addEventListener("click", () => sendToEmulator("run"));
loadEmuBtn.addEventListener("click", () => sendToEmulator("load"));

// Upload a local .asm from disk into a new tab.
uploadBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", async () => {
  const f = fileInput.files?.[0];
  if (!f) return;
  const text = await f.text();
  const uniqueName = uniqueFilename(f.name);
  captureView();
  tabs.push({ filename: uniqueName, source: text });
  active = tabs.length - 1;
  showTab(tabs[active]);
  fileInput.value = "";
  saveTabs();
  renderTabs();
  onChange();
});

resetBtn.addEventListener("click", async () => {
  const ok = await askConfirm(
    "Reset the current tab to the 'aloha' example? This replaces its content.",
  );
  if (!ok) return;
  const def = EXAMPLES.find((e) => e.name === "aloha");
  if (!def) return;
  const defSource = await def.source;
  const uniqueName = uniqueFilename(def.filename);
  tabs[active] = { filename: uniqueName, source: defSource };
  showTab(tabs[active]);
  select.value = def.name;
  saveTabs();
  renderTabs();
  onChange();
});

const buildTimeEl = document.getElementById("build-time");
if (buildTimeEl && BUILD_TIME) buildTimeEl.textContent = BUILD_TIME;

themeBtn.addEventListener("click", () => {
  const next: Theme = document.body.classList.contains("theme-light")
    ? "dark"
    : "light";
  applyTheme(next);
  saveTheme(next);
});

applyTheme(loadTheme());

function numOrUndef(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined;
}

async function loadTabsFromStorage(): Promise<void> {
  try {
    const raw = localStorage.getItem(TABS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        tabs = parsed.map((t) => ({
          filename: String(t.filename ?? DEFAULT_FILENAME),
          source: String(t.source ?? ""),
          selectionStart: numOrUndef(t.selectionStart),
          selectionEnd: numOrUndef(t.selectionEnd),
          scrollTop: numOrUndef(t.scrollTop),
          scrollLeft: numOrUndef(t.scrollLeft),
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
  if (!src) src = (await EXAMPLES[0]?.source) ?? "";
  if (!name) name = EXAMPLES[0]?.filename ?? DEFAULT_FILENAME;
  tabs = [{ filename: name, source: src }];
  active = 0;
  saveTabs();
}

// Persist caret/scroll of the active tab when the page goes away so a
// reload lands where the user left off (input already saves on each edit).
window.addEventListener("pagehide", () => {
  captureView();
  saveTabs();
});

(async () => {
  await loadTabsFromStorage();
  showTab(tabs[active]);
  renderTabs();
  onChange();
})();
