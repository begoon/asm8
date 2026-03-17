# asm8

Intel 8080 two-pass assembler in a single file (`asm8.ts`), with CLI driver.

## Commands

- `bun test` — run all tests
- `bun run asm8.ts <file.asm> [--one|--split]` — assemble a file
- `bun fmt` — format with prettier (`bunx --bun prettier --write`)

## Project layout

```text
asm8.ts                  assembler + CLI (single file, exports `asm()`)
tests/asm8.test.ts       golden-file test: monitor.asm vs mon32.bin
tests/asm8-instructions.test.ts  all i8080 instruction encodings
target/monitor.asm       reference input (Radio-86RK monitor ROM)
target/mon32.bin         reference binary (2048 bytes, F800-FFFF)
```

## Architecture

Two-pass assembler. Pass 1 collects symbols (labels + equ), pass 2 emits bytes.
`asm(source: string)` returns `Section[]` where each section has `start`, `end`, `data`.
A new section starts at each `org` directive.

## Conventions

- One `let` per variable declaration (no comma-separated `let` chains)
- Format with prettier before committing
