# asm8080

Intel 8080 two-pass assembler written in TypeScript.

Built primarily to assemble the Radio-86RK monitor ROM, but works with any Intel 8080 source.

## Playground

Try it in the browser: **[begoon.github.io/asm8](https://begoon.github.io/asm8/)**

- Live assembly listing — addresses and hex bytes appear in the gutter, wrap at four bytes (click `…` for the full dump).
- Multi-tab editor. Each tab holds its own filename and source; all tabs and the active index persist in `localStorage`.
- Built-in examples (`aloha`, `ok`, `sections`, `expressions`, `$`, local labels, `.if/.else`, `.proc/.return`, sokoban, pong, banner, volcano, lestnica). Loading an example always opens a new tab.
- `upload` / `download` read and write `.asm` files.
- **download as** dropdown picks the output envelope — `.rk` (default), `.rkr`, `.pki`, `.gam`, or raw `.bin`. Tape formats prepend a 4-byte big-endian start/end header (plus an extra `E6h` sync byte for `.pki` / `.gam`) and append `E6 + 2-byte checksum`. The payload is always packed tight (`min(start)..max(end)`, gaps zero-filled), so `org 3000h` programs stay compact. The choice is persisted in `localStorage`.
- **run** button (or `Ctrl/Cmd+R`) boots the assembled binary in the [rk86.ru](https://rk86.ru/beta) emulator via a `data:` URL — always as `.rk`, regardless of the download format (the emulator's `?run=` handler only accepts that envelope).
- Dark / light theme toggle.

Build locally with `just playground` — regenerates `docs/build-info.ts` and bundles `docs/playground.ts` with Bun.

## Install

```sh
npm install asm8080
```

## CLI

Run directly from npm (no install required):

```sh
npx asm8080 <source.asm> [more.asm ...] [--split] [--format <ext>] [-l] [-o <dir>]
bunx asm8080 <source.asm> [more.asm ...] [--split] [--format <ext>] [-l] [-o <dir>]
```

Multiple input files are concatenated in the order given and assembled as if they were one file. The first filename determines the output `<base>`.

Options:

- `--split` — one file per section, named `<base>-<sectionname>.bin` (or `<base>-XXXX-XXXX.bin` for unnamed sections). If there is only one section, it's written as `<base>.<format>`.
- `--format <ext>` — output envelope for the single-file case. `bin` (default) emits the raw payload; `rk` / `rkr` / `pki` / `gam` wrap it as a Radio-86RK tape file:

  | ext          | layout                                                                |
  | ------------ | --------------------------------------------------------------------- |
  | `rk`, `rkr`  | `start_hi start_lo end_hi end_lo` ‖ payload ‖ `E6 cs_hi cs_lo`        |
  | `pki`, `gam` | `E6` ‖ `start_hi start_lo end_hi end_lo` ‖ payload ‖ `E6 cs_hi cs_lo` |

  Addresses are big-endian and `end` is **inclusive**. Checksum is the monitor's `chksum` routine (`F82Ah`) — every byte except the last feeds both halves of a 16-bit sum (`lo += b, hi += b + carry`); the last byte adds to the low half only. For tape formats the payload is packed tight from `min(start)..max(end)` (no leading zero fill). `.bin` keeps its legacy "load at address 0" layout. Combining a non-bin format with `--split` and more than one section is a hard error.

- `-l` — generate listing (`.lst`), symbol table (`.sym`), section map (`.map`), and structured listing (`.json`) files
- `-o <dir>` — output directory (created if needed)
- `-v`, `--version` — print version
- `-h`, `--help` — show help

Default output is a single file `<base>.bin` containing all sections placed at their addresses, with zeros filling any gaps (including in front of the first section if its ORG isn't 0). The file is sized to the end of the last section — not padded to 64 KB. Overlapping sections are an error. With `--split`, each section is written as a separate file without padding.

```sh
bunx asm8080 prog.asm --format rk          # prog.rk
bunx asm8080 prog.asm --format gam -o out  # out/prog.gam
```

A section map is printed to stdout:

```text
F800-FFFF  2048 bytes
```

With `-l`, a listing file (`.lst`) and a symbol table file (`.sym`) are generated alongside the binary output. Each source line in `.lst` is prefixed with its address and emitted bytes:

```text
F800: C3 36 F8      start:           jmp  entry_start
F803: 3E 8A                          mvi  a, 8Ah
```

The `.sym` file contains one symbol per line, sorted alphabetically:

```text
ENTRY_START              F836
START                    F800
```

The `.map` file summarizes the section layout:

```text
F800-FFFF   2048 bytes

Total: 2048 bytes in 1 section
```

The `.json` file contains the same information in a machine-readable form, split into `code`, `symbols`, and `map`:

```json
{
  "code": [
    {
      "line": 4,
      "label": "start",
      "op": "mvi",
      "addr": "0100",
      "bytes": "3E 42",
      "chars": ">B",
      "arg1": "a",
      "arg2": "42h",
      "comment": "; load"
    },
    {
      "line": 7,
      "label": "msg",
      "op": "db",
      "addr": "0106",
      "bytes": "48 69 00",
      "chars": "Hi.",
      "data": "'Hi', 0"
    }
  ],
  "symbols": { "MSG": "0106", "START": "0100" },
  "map": {
    "sections": [{ "start": "0100", "end": "0108", "size": 9 }],
    "total": 9
  }
}
```

Each `code` entry has `line` plus any relevant subset of `addr`, `bytes`, `chars`, `label`, `op`, `arg1`/`arg2` (instructions) or `data` (`db`/`dw`/`ds`), and `comment` (`;`-prefixed).

## API

```ts
import { asm } from "asm8080";

const sections = asm(source);
// Section[] — each section has: start, end, data, name?
```

Each `org` directive creates a new section. The `section name` directive names it.

## Assembler features

- Two-pass assembly. Forward references resolve for both labels and `equ`
  (including chained `equ`-to-`equ` expressions — unresolved entries are
  iteratively re-evaluated to a fixpoint after the first pass)
- Case-insensitive mnemonics, registers, and symbols
- All documented Intel 8080 instructions
- Directives: `org`, `section`, `db`, `dw`, `ds`, `equ`, `end` — each may also be written with a leading dot (`.org`, `.db`, etc.) for compatibility with other assemblers
- `ds N` reserves `N` bytes filled with 0; `ds N (F)` reserves `N` bytes filled with byte value `F`
- Number formats: decimal (`255`), hex with `h` suffix (`0FFh`)
- Character literals: `'A'` (usable anywhere a byte value is expected)
- Strings in `db`: `db "hello"` or `db 'hello'`
- Expressions: `+`, `-`, `*`, `/`, `%`, `|`, `&`, `^`, `~`, `<<`, `>>`, `()` with C precedence
- `LOW(expr)` / `HIGH(expr)` — extract low or high byte of a 16-bit value
- `$` — current address (at the start of the current instruction or directive)
- Local labels: `@name:` or `.name:` — scoped to the most recent non-local label. `foo: ... @loop:` defines the symbol `foo@loop`; `foo: ... .loop:` defines `foo.loop`. Within `foo`'s scope, `jmp @loop` / `jmp .loop` resolves to that symbol. A colon is required, just as for normal labels (this also disambiguates `.loop:` from directives like `.org` / `.db`).

```asm
  delay:
            mvi b, 10
  @loop:    dcr b
            jnz @loop
            ret

  delay2:
            mvi b, 10
  .loop:    dcr b
            jnz .loop
            ret
```

- Multiple statements per line joined with `/` (spaces required on both sides), up to 10 per line:

```asm
  push h / push b / push d
  pop  d / pop  b / pop  h
```

  To disambiguate from division, the split only fires when a valid instruction name (or directive, optionally dotted) follows the `/`. So `mvi a, 10 / 2` is still treated as division (`10 / 2 = 5`).

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
