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

## CLI flags

- `--split` — one file per section (`name.bin` or `XXXX-XXXX.bin`)
- `-l` — generate listing file (`.lst`) with addresses, hex bytes, source, and symbol table
- `-o <dir>` — output directory (created if needed)
- `-v` — print version from package.json
- `-h` — help

## Conventions

- One `let` per variable declaration (no comma-separated `let` chains)
- Format with prettier before committing
