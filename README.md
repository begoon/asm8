# asm8

A generic Intel 8080 assembler written in TypeScript. Runs with [Bun](https://bun.sh).

Built primarily to assemble the Radio-86RK monitor ROM, but works with any Intel 8080 source.

## Usage

Assemble a source file:

```sh
bun run asm8.ts <source.asm> [--one|--split]
```

- `--one` (default) — produces a single 64 KB file `0000-FFFF.bin` with sections placed at their addresses
- `--split` — produces one file per section, named `SSSS-EEEE.bin`

A section map is printed to stdout:

```text
F800-FFFF  2048 bytes
```

## Assembler features

- Two-pass assembly (forward references resolved automatically)
- Case-insensitive mnemonics, registers, and symbols
- All documented Intel 8080 instructions
- Directives: `org`, `db`, `dw`, `equ`, `end`
- Number formats: decimal (`255`), hex with `h` suffix (`0FFh`)
- Character literals: `'A'` (usable anywhere a byte value is expected)
- Strings in `db`: `db "hello"` or `db 'hello'`
- Expressions with `+` and `-`: `lxi h, base + offset - 1`

## Tests

```sh
bun test
```

- `tests/asm8.test.ts` — assembles `monitor.asm` and verifies byte-identical output against `mon32.bin`
- `tests/asm8-instructions.test.ts` — exercises all 8080 instruction encodings, directives, expressions, labels, and edge cases

## Reference files

- `target/monitor.asm` — Radio-86RK monitor ROM source (1494 lines)
- `target/mon32.bin` — expected binary output (2048 bytes, F800-FFFF)
