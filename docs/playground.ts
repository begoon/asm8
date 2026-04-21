import { asm, lineInfo, AsmError, type LineInfo, type Section } from "../asm8";
import { EXAMPLES } from "./examples";
import { BUILD_TIME } from "./build-info";

const STORAGE_KEY = "asm8-playground:source";
const FILENAME_KEY = "asm8-playground:filename";
const TABS_KEY = "asm8-playground:tabs";
const ACTIVE_KEY = "asm8-playground:active";
const THEME_KEY = "asm8-playground:theme";
const FORMAT_KEY = "asm8-playground:format";
const DEFAULT_FILENAME = "program.asm";

type OutputFormat = "asm" | "bin" | "rk" | "rkr" | "pki" | "gam";
const OUTPUT_FORMATS: readonly OutputFormat[] = [
  "asm",
  "bin",
  "rk",
  "rkr",
  "pki",
  "gam",
];
const DEFAULT_FORMAT: OutputFormat = "asm";

interface Tab {
  filename: string;
  source: string;
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
const uploadBtn = document.getElementById("upload-asm") as HTMLButtonElement;
const downloadBtn = document.getElementById(
  "download-btn",
) as HTMLButtonElement;
const downloadFormatSel = document.getElementById(
  "download-format",
) as HTMLSelectElement;
const runBinBtn = document.getElementById("run-bin") as HTMLButtonElement;
const resetBtn = document.getElementById("reset") as HTMLButtonElement;
const themeBtn = document.getElementById("theme") as HTMLButtonElement;
const fileInput = document.getElementById("file-input") as HTMLInputElement;
const filenameInput = document.getElementById("filename") as HTMLInputElement;
const tabsEl = document.getElementById("tabs") as HTMLDivElement;

function asmName(): string {
  return filenameInput.value.trim() || DEFAULT_FILENAME;
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
  const checksum = rk86CheckSum(payload);
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
  tabs[active].source = source.value;
  const uniqueName = uniqueFilename(ex.filename);
  tabs.push({ filename: uniqueName, source: exSource });
  active = tabs.length - 1;
  source.value = exSource;
  filenameInput.value = uniqueName;
  lastGoodName = uniqueName;
  source.scrollTop = 0;
  saveTabs();
  renderTabs();
  onChange();
  source.focus();
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
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "r") {
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
  const out: string[] = [];
  for (let i = 1; i <= totalLines; i++) {
    out.push(fmtGutterGroup(groups.get(i)));
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
  div.style.top = `${PAD_TOP + (errLine - 1) * LINE_HEIGHT - source.scrollTop}px`;
  div.style.height = `${LINE_HEIGHT}px`;
  highlight.appendChild(div);
}

let errLine: number | null = null;
let lastSections: Section[] | null = null;

function compile() {
  const src = source.value;
  const totalLines = src.length === 0 ? 1 : src.split("\n").length;
  try {
    const info = lineInfo(src);
    lastSections = asm(src);
    renderGutter(info, totalLines);
    errLine = null;
    renderHighlight(null);
    errorEl.classList.remove("visible");
    errorEl.textContent = "";
    updateDownloadEnabled();
    runBinBtn.disabled = lastSections.length === 0;
  } catch (e) {
    lastSections = null;
    updateDownloadEnabled();
    runBinBtn.disabled = true;
    if (e instanceof AsmError) {
      errLine = e.line;
      errorEl.classList.add("visible");
      errorEl.textContent = `line ${e.line}: ${e.message}`;
    } else {
      errLine = null;
      errorEl.classList.add("visible");
      errorEl.textContent = (e as Error).message;
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

async function closeTab(i: number) {
  const current = i === active ? source.value : tabs[i].source;
  if (current.trim().length > 0) {
    const ok = await askConfirm(
      `Close "${tabs[i].filename}"? Its content will be lost.`,
    );
    if (!ok) return;
  }
  if (tabs.length === 1) {
    tabs[0] = { filename: DEFAULT_FILENAME, source: "" };
    active = 0;
    source.value = "";
    filenameInput.value = tabs[0].filename;
    lastGoodName = tabs[0].filename;
  } else {
    tabs.splice(i, 1);
    if (active > i) active--;
    else if (active === i && active >= tabs.length) active = tabs.length - 1;
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

let lastGoodName = "";
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
});

function syncScroll() {
  gutter.style.transform = `translateY(${-source.scrollTop}px)`;
  if (errLine !== null) renderHighlight(errLine);
}

function onChange() {
  save();
  compile();
  syncScroll();
}

source.addEventListener("input", onChange);
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

// The rk86.ru emulator's ?run= handler expects the .rk tape envelope,
// so force that format for Run regardless of what the user picked for
// download.
runBinBtn.addEventListener("click", () => {
  const rk = buildOutput("rk");
  if (!rk) return;
  const dataUrl = `data:;name=${outputName("rk")};base64,${toBase64(rk)}`;
  const runUrl = `https://rk86.ru/beta/index.html?run=${encodeURIComponent(dataUrl)}`;
  window.open(runUrl, "_blank", "noopener");
});

uploadBtn.addEventListener("click", () => fileInput.click());

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
  source.value = defSource;
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
  if (!f) return;
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

async function loadTabsFromStorage(): Promise<void> {
  try {
    const raw = localStorage.getItem(TABS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        tabs = parsed.map((t) => ({
          filename: String(t.filename ?? DEFAULT_FILENAME),
          source: String(t.source ?? ""),
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

(async () => {
  await loadTabsFromStorage();
  source.value = tabs[active].source;
  filenameInput.value = tabs[active].filename;
  lastGoodName = tabs[active].filename;
  renderTabs();
  onChange();
})();
