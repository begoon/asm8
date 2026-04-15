# asm8080

Intel 8080 two-pass assembler written in TypeScript.

Built primarily to assemble the Radio-86RK monitor ROM, but works with any Intel 8080 source.

## Install

```sh
npm install asm8080
```

## CLI

Run directly from npm (no install required):

```sh
npx asm8080 <source.asm> [--split] [-l] [-o <dir>]
bunx asm8080 <source.asm> [--split] [-l] [-o <dir>]
```

Options:

- `--split` — one file per section (`name.bin` or `XXXX-XXXX.bin`)
- `-l` — generate listing file (`.lst`)
- `-o <dir>` — output directory (created if needed)
- `-v`, `--version` — print version
- `-h`, `--help` — show help

Default output is a single 64 KB file `0000-FFFF.bin` with sections placed at their addresses. With `--split`, each section is written as a separate file.

A section map is printed to stdout:

```text
F800-FFFF  2048 bytes
```

With `-l`, a listing file is generated alongside the binary output. Each source line is prefixed with its address and emitted bytes, and a symbol table is appended:

```text
F800: C3 36 F8      start:           jmp  entry_start
F803: 3E 8A                          mvi  a, 8Ah

Symbol Table:

ENTRY_START              F836
START                    F800
```

## API

```ts
import { asm } from "asm8080";

const sections = asm(source);
// Section[] — each section has: start, end, data, name?
```

Each `org` directive creates a new section. The `section name` directive names it.

## Assembler features

- Two-pass assembly (forward references resolved automatically)
- Case-insensitive mnemonics, registers, and symbols
- All documented Intel 8080 instructions
- Directives: `org`, `section`, `db`, `dw`, `equ`, `end`
- Number formats: decimal (`255`), hex with `h` suffix (`0FFh`)
- Character literals: `'A'` (usable anywhere a byte value is expected)
- Strings in `db`: `db "hello"` or `db 'hello'`
- Expressions: `+`, `-`, `*`, `/`, `%`, `|`, `&`, `^`, `~`, `<<`, `>>`, `()` with C precedence
- `LOW(expr)` / `HIGH(expr)` — extract low or high byte of a 16-bit value

## Tests

```sh
bun test
```

- `tests/asm8.test.ts` — assembles `monitor.asm` and verifies byte-identical output against `mon32.bin`
- `tests/asm8-instructions.test.ts` — exercises all 8080 instruction encodings, directives, expressions, labels, and edge cases

## Reference files

- `target/monitor.asm` — Radio-86RK monitor ROM source
- `target/mon32.bin` — expected binary output (2048 bytes, F800-FFFF)

## License

MIT
