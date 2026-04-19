import { asm, lineInfo, AsmError, type LineInfo, type Section } from "../asm8";
import { EXAMPLES } from "./examples";
import { BUILD_TIME } from "./build-info";

const STORAGE_KEY = "asm8-playground:source";
const FILENAME_KEY = "asm8-playground:filename";
const THEME_KEY = "asm8-playground:theme";
const DEFAULT_FILENAME = "program.asm";

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
const confirmMessage = document.getElementById("confirm-message") as HTMLParagraphElement;
const confirmOk = document.getElementById("confirm-ok") as HTMLButtonElement;
const confirmCancel = document.getElementById("confirm-cancel") as HTMLButtonElement;
const uploadBtn = document.getElementById("upload-asm") as HTMLButtonElement;
const downloadAsmBtn = document.getElementById("download-asm") as HTMLButtonElement;
const downloadBinBtn = document.getElementById("download-bin") as HTMLButtonElement;
const runBinBtn = document.getElementById("run-bin") as HTMLButtonElement;
const resetBtn = document.getElementById("reset") as HTMLButtonElement;
const themeBtn = document.getElementById("theme") as HTMLButtonElement;
const fileInput = document.getElementById("file-input") as HTMLInputElement;
const filenameInput = document.getElementById("filename") as HTMLInputElement;

function asmName(): string {
  return filenameInput.value.trim() || DEFAULT_FILENAME;
}

function binName(): string {
  const n = asmName();
  const base = n.replace(/\.[^.]*$/, "") || n;
  return base + ".bin";
}

const LINE_HEIGHT = 20;
const PAD_TOP = 8;

for (const ex of EXAMPLES) {
  const opt = document.createElement("option");
  opt.value = ex.name;
  opt.textContent = ex.name;
  select.appendChild(opt);
}

select.addEventListener("change", () => {
  const ex = EXAMPLES.find((e) => e.name === select.value);
  if (!ex) return;
  source.value = ex.source;
  filenameInput.value = ex.filename;
  saveFilename();
  source.scrollTop = 0;
  onChange();
  source.focus();
});

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
      errorEl.textContent = (e as Error).message;
    }
    gutter.innerHTML = "";
    renderHighlight(errLine);
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, source.value);
  } catch {}
}

function saveFilename() {
  try {
    localStorage.setItem(FILENAME_KEY, filenameInput.value);
  } catch {}
}

filenameInput.addEventListener("input", saveFilename);

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

function flattenSections(sections: Section[]): Uint8Array {
  if (sections.length === 0) return new Uint8Array(0);
  const maxEnd = sections.reduce((m, s) => Math.max(m, s.end), 0);
  const buf = new Uint8Array(maxEnd + 1);
  for (const s of sections) buf.set(s.data, s.start);
  return buf;
}

downloadAsmBtn.addEventListener("click", () => {
  downloadBlob(source.value, asmName(), "text/plain");
});

function buildBin(): Uint8Array | null {
  if (!lastSections || lastSections.length === 0) return null;
  const overlap = findOverlap(lastSections);
  if (overlap) {
    const [a, b] = overlap;
    alert(
      `sections overlap: ${hex4(a.start)}-${hex4(a.end)} and ${hex4(b.start)}-${hex4(b.end)}`,
    );
    return null;
  }
  return flattenSections(lastSections);
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

downloadBinBtn.addEventListener("click", () => {
  const bin = buildBin();
  if (!bin) return;
  downloadBlob(bin, binName(), "application/octet-stream");
});

runBinBtn.addEventListener("click", () => {
  const bin = buildBin();
  if (!bin) return;
  const dataUrl = `data:;name=${binName()};base64,${toBase64(bin)}`;
  const runUrl = `https://rk86.ru/beta/index.html?run=${encodeURIComponent(dataUrl)}`;
  window.open(runUrl, "_blank", "noopener");
});

uploadBtn.addEventListener("click", () => fileInput.click());

resetBtn.addEventListener("click", async () => {
  const ok = await askConfirm(
    "Reset editor and load the 'hello' example? This deletes your current source.",
  );
  if (!ok) return;
  const def = EXAMPLES.find((e) => e.name === "hello");
  if (!def) return;
  source.value = def.source;
  filenameInput.value = def.filename;
  select.value = def.name;
  saveFilename();
  source.scrollTop = 0;
  onChange();
  source.focus();
});

fileInput.addEventListener("change", async () => {
  const f = fileInput.files?.[0];
  if (!f) return;
  const text = await f.text();
  source.value = text;
  filenameInput.value = f.name;
  saveFilename();
  fileInput.value = "";
  onChange();
  source.focus();
});

const buildTimeEl = document.getElementById("build-time");
if (buildTimeEl && BUILD_TIME) buildTimeEl.textContent = `build ${BUILD_TIME}`;

themeBtn.addEventListener("click", () => {
  const next: Theme = document.body.classList.contains("theme-light")
    ? "dark"
    : "light";
  applyTheme(next);
  saveTheme(next);
});

applyTheme(loadTheme());

let initial = "";
let initialName = "";
try {
  initial = localStorage.getItem(STORAGE_KEY) ?? "";
  initialName = localStorage.getItem(FILENAME_KEY) ?? "";
} catch {}
if (!initial) initial = EXAMPLES[0]?.source ?? "";
if (!initialName) initialName = EXAMPLES[0]?.filename ?? DEFAULT_FILENAME;
source.value = initial;
filenameInput.value = initialName;
onChange();
