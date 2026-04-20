# Changelog

## 1.0.23 — 2026-04-20

- Playground: add `volcano` and `lestnica` examples; rename `hello` to
  `aloha` in the example menu; drop the standalone `proc / endp / return`
  entry (the `proc-ret.asm` and `proc-jmp.asm` entries cover it). The
  Reset button now defaults to `aloha`.

## 1.0.22 — 2026-04-19

- `.return` codegen: instead of inlining the pop-sequence + `RET` at
  each early-exit site, `.return` now emits `JMP __proc_<N>_exit` and
  `.endp` emits a shared `__proc_<N>_exit:` label followed by the pops
  and `RET`. When the `.proc` has no register list, `.return` degrades
  to a bare `RET` (1 byte) and no exit label is emitted. Fall-through
  to `.endp` still produces pops + `RET` as before.
- `equ` now resolves forward references. Previously the expression was
  evaluated at its source position and any symbol defined later failed
  with "unknown symbol". Unresolved `equ`s are queued during pass 1
  and iteratively resolved to a fixpoint, so chains like
  `A equ B + 1 / B equ C * 2 / C equ 3` work regardless of order.
  Genuine cycles still error at the offending line.

## 1.0.21 — 2026-04-19

- Add `.proc` / `.endp` / `.return` directives for register-saving
  procedures. `<name> .proc [PSW, B, D, H]` emits the label and pushes
  the listed pairs; `.endp` pops them in reverse and emits `RET`.
  `.return` performs the same pop-and-return sequence for early exit.
  Procedures cannot nest; a raw `ret` inside the body skips the pops
  and corrupts the stack — use `.return` instead.
- All preprocessor directives (`.if` / `.else` / `.endif` / `.proc` /
  `.endp` / `.return`) now accept the leading dot as optional,
  matching the existing `org` / `.org` convention — `foo proc h` and
  `if Z` work just like `foo .proc h` and `.if Z`.

  ```asm
  strlen .proc b, h
      mvi b, 0
  loop:
      mov a, m
      cpi 0
      .if Z
        .return
      .endif
      inr b
      inx h
      jmp loop
  .endp
  ```

## 1.0.20 — 2026-04-19

- Add `.if` / `.else` / `.endif` directives. `.if <flag>` skips the
  body when the flag is false, where `<flag>` is one of
  `Z NZ C NC PO PE P M`, or the aliases `==` (Z) and `<>` (NZ).
  Blocks nest. The preprocessor expands them into i8080 jumps and
  local labels (`@_if_<N>_else` / `@_if_<N>_exit`) before pass 1,
  preserving original line numbers in error messages. Keep a block
  within a single non-local scope.

  ```asm
      cpi 11h
      .if ==
        mov a, b
      .else
        mov a, c
      .endif
  ```

  Nested example — classify A into <10 / 10-19 / >=20:

  ```asm
  classify:
      cpi 20
      .if NC                ; A >= 20
        mvi b, 2
      .else
        cpi 10
        .if NC              ; 10 <= A < 20
          mvi b, 1
        .else               ; A < 10
          mvi b, 0
        .endif
      .endif
      ret
  ```

## 1.0.19 — 2026-04-19

- Loosen label-colon requirement: a label preceding an instruction or
  directive on the same line may omit the colon
  (e.g. `start mov a, b`, `@loop jmp @loop`, `msg db 'hi'`). A label
  alone on a line still requires a colon — a bare unknown token remains
  an `unknown mnemonic` error, preserving typo detection. A label is
  recognized only when the next token is a known mnemonic/directive.
- Fix: `foo: equ 42` now correctly defines `foo = 42` (previously it
  silently set `foo` to the current PC).

## 1.0.18 — 2026-04-18

- Add local labels: `@name:` and `.name:` scope to the most recent
  non-local label (e.g. `foo: ... @loop:` defines `foo@loop`; `foo: ... .loop:`
  defines `foo.loop`). Colon is required on definition — this also
  distinguishes `.loop:` from directives like `.org` / `.db`.
- Add `$` symbol: evaluates to the current address in any expression.
- Fix: `equ` labels no longer reset the local-label scope, so
  `len equ $ - .start` correctly references `.start` in the enclosing scope.
