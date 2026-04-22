# asm8080

Intel 8080 two-pass assembler written in TypeScript.

Built primarily to assemble the Radio-86RK monitor ROM, but works with any Intel 8080 source.

## Playground

Try it in the browser: **[begoon.github.io/asm8](https://begoon.github.io/asm8/)**

- Live assembly listing — addresses and hex bytes appear in the gutter, wrap at four bytes (click `…` for the full dump).
- Multi-tab editor. Each tab holds its own filename and source; all tabs and the active index persist in `localStorage`.
- Built-in example list is **runtime-loaded** from `docs/examples.js`, a plain `<script>` that assigns `window.asm8Examples = [{ name, filename }, ...]` before the bundle runs. A different deployment (e.g. the copy embedded in [rk86-js-v2-svelte](https://github.com/begoon/rk86-js-v2-svelte)) can ship a different dropdown without rebuilding `playground.js` — just edit `examples.js`. Loading an example always opens a new tab.
- `upload` reads an `.asm` file into a new tab.
- **download as** dropdown picks the output — `.asm` (default, writes the current source) or one of `.rk` / `.rkr` / `.pki` / `.gam` / `.bin` (writes the assembled bytes). Tape formats prepend a 4-byte big-endian start/end header (plus an extra `E6h` sync byte for `.pki` / `.gam`) and append `E6 + 2-byte checksum`. Binary payloads are always packed tight (`min(start)..max(end)`, gaps zero-filled), so `org 3000h` programs stay compact. The choice is persisted in `localStorage`.
- **run** button (or `Ctrl/Cmd+R`) boots the assembled `.rk` in the emulator. Cross-origin (standalone playground → [rk86.ru](https://rk86.ru/beta)) passes the file as a `data:` URL in `?run=`; same-origin embeds hand off through `localStorage["asm8-handoff:<uuid>"]` + `?handoff=<uuid>` to avoid Chrome's URL-length cap on large programs. A same-origin embed activates that path by setting `window.asm8EmulatorUrl = "../"` in `index.html` before the module script.
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

- `--trailer-padding [N]` — inject `N` zero bytes between the payload and the `E6 cs_hi cs_lo` trailer of a tape-file envelope (`rk` / `rkr` / `pki` / `gam`). Useful when a loader needs a quiet gap before re-syncing on the checksum marker. `N` defaults to `2` when the flag is given without a number; omitting the flag entirely yields the legacy no-padding layout. Ignored for `--format bin`. Padding is **not** included in the checksum.

  ```sh
  bun run asm8.ts prog.asm --format rk --trailer-padding       # 2 zeros
  bun run asm8.ts prog.asm --format rk --trailer-padding 5     # 5 zeros
  ```

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

The `.json` file contains the same information in a machine-readable form, split into `code`, `symbols`, and `map`, with a top-level `version` field:

```json
{
  "version": 2,
  "code": [
    {
      "line": 4,
      "label": "start",
      "op": "mvi",
      "addr": "0100",
      "length": 2,
      "bytes": ["3E", "42"],
      "chars": [">", "B"],
      "arg1": { "text": "a", "type": "reg", "value": 7 },
      "arg2": { "text": "42h", "type": "imm8", "value": 66 },
      "comment": "; load"
    },
    {
      "line": 7,
      "label": "msg",
      "op": "db",
      "addr": "0106",
      "length": 3,
      "bytes": ["48", "69", "00"],
      "chars": ["H", "i", "."],
      "data": {
        "kind": "db",
        "parts": [
          {
            "text": "'Hi'",
            "bytes": ["48", "69"],
            "values": [72, 105],
            "chars": ["H", "i"]
          },
          { "text": "0", "bytes": ["00"], "values": [0], "chars": ["."] }
        ]
      }
    }
  ],
  "symbols": { "MSG": "0106", "START": "0100" },
  "map": {
    "sections": [{ "start": "0100", "end": "0108", "size": 9 }],
    "total": 9
  }
}
```

### `code` entries

Every entry has `line` (1-based source line). The rest is optional and applies where meaningful:

- `addr` — 4-char hex address of the instruction or directive
- `length` — bytes produced by this line
- `bytes` — 2-char hex per emitted byte, one element per byte
- `chars` — printable char per byte (1:1 with `bytes`, `"."` for non-printable)
- `label`, `op` (lowercase), `comment` (`;`-prefixed, verbatim)
- `arg1` / `arg2` — see **Argument shape** below (instructions, `org`, `equ`, `section`)
- `data` — see **Data directives** below (`db` / `dw` / `ds`)

### Argument shape

Each instruction operand is an object:

```ts
{
  text: string,          // verbatim operand text from the source
  type: "reg" | "regpair" | "imm8" | "imm16"
      | "addr16" | "port8" | "rst" | "name",
  value?: number         // evaluated numeric value (absent for type "name")
}
```

`value` semantics per `type`:

| type      | value                                                                       |
| --------- | --------------------------------------------------------------------------- |
| `reg`     | i8080 3-bit register field: B=0, C=1, D=2, E=3, H=4, L=5, M=6, A=7          |
| `regpair` | i8080 2-bit `rp` field: BC=0, DE=1, HL=2, SP=3, PSW=3 (use `text` to split) |
| `imm8`    | 8-bit immediate (`MVI`, `ADI` …, `CPI`)                                     |
| `imm16`   | 16-bit immediate (`LXI rp, n16`; also used for `ORG`, `EQU`)                |
| `addr16`  | 16-bit absolute address (`JMP`, `CALL`, conditional J*/C*, `LDA`/`STA`, …)  |
| `port8`   | 8-bit port number (`IN`, `OUT`)                                             |
| `rst`     | RST vector index 0..7                                                       |
| `name`    | identifier (section name); no `value` emitted                               |

Example: `LXI H, 1234h` →

```json
"arg1": { "text": "H",     "type": "regpair", "value": 2 },
"arg2": { "text": "1234h", "type": "imm16",   "value": 4660 }
```

SP and PSW share encoding `3`; disambiguate by reading `text` or `op`.

### Data directives (`db` / `dw` / `ds`)

`db` and `dw` produce a `parts` array, one element per comma-separated source segment. Each part:

```ts
{
  text: string,      // verbatim source fragment
  bytes: string[],   // 2-char hex bytes (DW is little-endian: "dw 1234h" -> ["34","12"])
  values: number[],  // db: byte values (0..255);  dw: word values (0..65535)
  chars: string[]    // 1:1 with bytes, "." for non-printable
}
```

`ds` has no literal bytes — instead:

```json
"data": { "kind": "ds", "size": 16 }          // ds 16
"data": { "kind": "ds", "size": 16, "fill": 255 }  // ds 16 (0FFh)
```

### Versioning

The top-level `"version": 2` field is stable. Future schema changes will bump this number; consumers should read `version` and branch on it.

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
