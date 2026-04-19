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
```

## Architecture

Two-pass assembler. Pass 1 collects symbols (labels + equ), pass 2 emits bytes.
`asm(source: string)` returns `Section[]` where each section has `start`, `end`, `data`, and optional `name`.
A new section starts at each `org` directive. The `section name` directive names the current section (must be unique, must follow `org`).

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
`.return` expands to the same pop-sequence + RET for early exit.
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

## CLI flags

- `--split` — one file per section (`name.bin` or `XXXX-XXXX.bin`)
- `-l` — generate listing (`.lst`) with addresses/hex bytes/source, symbol table (`.sym`), and section map (`.map`)
- `-o <dir>` — output directory (created if needed)
- `-v` — print version from package.json
- `-h` — help

## Conventions

- One `let` per variable declaration (no comma-separated `let` chains)
- Format with prettier before committing
