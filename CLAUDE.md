# asm8

Intel 8080 two-pass assembler in a single file (`asm8.ts`), with CLI driver.

## Commands

- `bun test` — run all tests
- `bun run asm8.ts <file.asm> [--split] [-o <dir>]` — assemble a file
- `bun fmt` — format with prettier (`bunx --bun prettier --write`)
- `just publish` — bump patch version, run tests, publish to npm

## npm package

Published as `asm8080` on npmjs. Run via `npx asm8080` or `bunx asm8080`.

## Project layout

```text
asm8.ts                  assembler + CLI (single file, exports `asm()` and `cli()`)
bin/asm8.js              shebang wrapper for npx/node
dist/                    tsc build output (gitignored)
tests/asm8.test.ts       golden-file test: monitor.asm vs mon32.bin
tests/asm8-instructions.test.ts  all i8080 instruction encodings
target/monitor.asm       reference input (Radio-86RK monitor ROM)
target/mon32.bin         reference binary (2048 bytes, F800-FFFF)
docs/                    browser playground (GitHub Pages served from here)
  index.html             playground shell
  style.css              theme vars + layout
  playground.ts          editor glue (bundled to playground.js via `just playground`)
  examples.ts            manifest of examples (lazy `fetch("examples/*.asm")` at load)
  examples/*.asm         example sources — edit these directly, no rebuild needed
  build-info.ts          generated at build time; holds BUILD_TIME constant
MONITOR.md               RK86 monitor ROM jump table (F800–F833) + notes
sokoban.asm              reference copy of the sokoban source at repo root
                         (the playground fetches docs/examples/sokoban.asm)
```

## Architecture

Two-pass assembler. Pass 1 collects symbols (labels + equ), pass 2 emits bytes.
`asm(source: string)` returns `Section[]` where each section has `start`, `end`, `data`, and optional `name`.
A new section starts at each `org` directive. The `section name` directive names the current section (must be unique, must follow `org`).

Pass 1 records label addresses as it walks. `equ` expressions that reference
symbols not yet defined are queued, and after the main pass a fixpoint loop
repeatedly re-evaluates the queue until it's empty (progress made) or nothing
resolves (unresolved symbol / cycle — surfaced as `unknown symbol` at the
offending line). This makes forward references work for both label-to-label
and equ-to-equ chains. The only case that still fails is a `DS N` whose `N`
depends on a forward reference, since `DS` shifts subsequent label PCs during
pass 1.

Expressions use a recursive descent parser with C operator precedence:
`+`, `-`, `*`, `/`, `%`, `|`, `&`, `^`, `~`, `<<`, `>>`, `()`, `LOW()`, `HIGH()`.
`$` evaluates to the current address (start of the current instruction/directive).

Labels: `name:` or `name mnemonic …` — the colon is required when the
label is alone on a line, optional when followed by an instruction or
directive on the same line. A colonless label is recognized only when
the next token is a known mnemonic/directive; otherwise the line is
reported as `unknown mnemonic`.

Local labels: `@name` or `.name`, with or without colon under the same
rule. Stored as `<lastLabel>@name` or `<lastLabel>.name`, where
`<lastLabel>` is the most recent non-local label. References to
`@name` / `.name` resolve relative to the enclosing scope. When a
`.name` label stands alone, the colon is required to distinguish it
from directives like `.org` / `.db`.

### Conditional assembly: `.if` / `.else` / `.endif`

A flag-driven preprocessor expands these directives into i8080 jumps
before pass 1. `.if <flag>` emits a jump that skips the body when
`<flag>` is **false**. Supported flags: `Z NZ C NC PO PE P M`, plus
aliases `==` (→ `Z`) and `<>` (→ `NZ`). Blocks nest. The leading dot
is optional — `if` / `else` / `endif` work the same as `.if` / `.else`
/ `.endif`, matching the existing `org` / `.org` convention.

Examples:

```asm
; if A == 11h: mov a, b
    cpi 11h
    .if ==
      mov a, b
    .endif
```

```asm
; if A >= 10 (unsigned): mov a, b else mov a, c
    cpi 10
    .if NC
      mov a, b
    .else
      mov a, c
    .endif
```

```asm
; nested: retry until A == 0
retry:
    call read
    cpi 0
    .if NZ
      .if C
        jmp error
      .else
        jmp retry
      .endif
    .endif
```

The preprocessor generates local labels `@_if_<N>_else` and
`@_if_<N>_exit` under the enclosing non-local label; avoid using label
names starting with `@_if_`. Keep an entire `.if`/`.endif` block inside
a single non-local scope — introducing a new top-level label between
the jump and its target will break label resolution.

### Procedures: `.proc` / `.endp` / `.return`

A procedure auto-saves and restores register pairs around its body.
Syntax: `<name> .proc [reg, reg, ...]` where each register is one of
`PSW B D H` (the four pushable pairs); separators may be commas or
whitespace. The preprocessor emits the label, pushes in listed order
at entry, and pops in reverse order followed by `RET` at `.endp`.

`.return` is compiled as a jump to a single shared exit block emitted
at `.endp`: `JMP __proc_<N>_exit`, where `<N>` is a per-proc counter.
`.endp` emits `__proc_<N>_exit:` (only when at least one `.return` was
used) followed by the reverse pops and `RET`. Fall-through into `.endp`
lands on the same teardown. As a special case, when `.proc` has no
register list, `.return` degrades to a bare `RET` (1 byte) and no exit
label is emitted.

Procedures cannot nest. The leading dot is optional — `proc` / `endp`
/ `return` work the same as the dotted forms.

Examples:

```asm
; save PSW and HL, do work, auto-restore + RET at .endp
abc .proc psw, h
    lxi h, buf
    mov a, m
.endp
```

```asm
; early exit with .return
strlen .proc b, h
    mvi b, 0
loop:
    mov a, m
    cpi 0
    .if Z
      .return           ; pops H, B and returns — length in B
    .endif
    inr b
    inx h
    jmp loop
.endp
```

A plain `ret` (or conditional `rz`/`rnz`/…) inside a `.proc` body
skips the pops and corrupts the stack — use `.return` for early exit.

## Playground (`docs/`)

Single-page editor deployed via GitHub Pages at
[begoon.github.io/asm8](https://begoon.github.io/asm8/). Run locally with
`just playground` — it regenerates `docs/build-info.ts` (via `date`), then
`bun build docs/playground.ts --target=browser --format=esm` bundles
everything into `docs/playground.js`. Examples are **not** inlined into the
bundle: `examples.ts` kicks off parallel `fetch("examples/<name>.asm")`
calls at module load, and the select / reset / init paths `await ex.source`
when they need the text. Editing an example = editing the .asm under
`docs/examples/`, no rebuild required.

The editor is multi-tab. State lives under two keys:

- `asm8-playground:tabs` — JSON array of `{ filename, source }`
- `asm8-playground:active` — active tab index

Extra keys: `asm8-playground:theme` (`light`/`dark`, defaults to light) and
the legacy `asm8-playground:source` / `:filename` (read once for migration
from the pre-tabs single-file storage).

Conventions:

- Each tab has a unique `filename`. Commits (blur/Enter) on the filename
  input validate uniqueness and revert on clash; live typing updates the
  tab label without gating.
- Loading an example always creates a new tab (disambiguated with
  `foo-2.asm` if needed). Uploads do the same.
- **Reset** replaces only the active tab with the `aloha` example
  (looked up by name in `EXAMPLES` — keep the name in sync if renamed).
  **Close** prompts for confirm when the tab's source is non-empty;
  closing the last tab clears it in place instead of leaving zero tabs.
- `run` / `download .bin` produce a proper Radio-86RK tape file
  (`.rk`): 4-byte big-endian header with `start`..`end` addresses,
  payload covering `min(start)..max(end)` (gaps zero-filled, leading
  zero-fill avoided so `org 3000h` programs don't carry 12 KB of
  leading zeros), then `0xE6` + 2-byte checksum from `rk86CheckSum`.
  `run` base64-encodes the `.rk`, wraps it in a `data:` URL, and opens
  `rk86.ru/beta/?run=...` in a new tab. `Ctrl/Cmd+R` triggers it.

The in-page confirm modal replaces `window.confirm()` because Chrome
suppresses native dialogs when the originating tab isn't foregrounded.

## CLI flags

- `--split` — one file per section (`name.bin` or `XXXX-XXXX.bin`)
- `-l` — generate listing (`.lst`) with addresses/hex bytes/source, symbol
  table (`.sym`), section map (`.map`), and structured listing (`.json`). The
  JSON is `{ code, symbols, map }`:
  - `code` — array of per-statement entries with fields `line`, `addr`,
    `bytes`, `chars`, `label`, `op`, `arg1`/`arg2` (instructions) or `data`
    (DB/DW/DS), and `comment` — all optional except `line`.
  - `symbols` — object mapping `NAME` (uppercased) to 4-digit hex address,
    sorted by name.
  - `map` — `{ sections: [{ start, end, size, name? }], total }` with addresses
    as 4-digit hex and sizes in bytes.
- `-o <dir>` — output directory (created if needed)
- `-v` — print version from package.json
- `-h` — help

## Conventions

- One `let` per variable declaration (no comma-separated `let` chains)
- Format with prettier before committing
