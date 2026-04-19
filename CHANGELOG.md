# Changelog

## 2026-04-19

- Loosen label-colon requirement: a label preceding an instruction or
  directive on the same line may omit the colon
  (e.g. `start mov a, b`, `@loop jmp @loop`, `msg db 'hi'`). A label
  alone on a line still requires a colon — a bare unknown token remains
  an `unknown mnemonic` error, preserving typo detection. A label is
  recognized only when the next token is a known mnemonic/directive.
- Fix: `foo: equ 42` now correctly defines `foo = 42` (previously it
  silently set `foo` to the current PC).

## 2026-04-18

- Add local labels: `@name:` and `.name:` scope to the most recent
  non-local label (e.g. `foo: ... @loop:` defines `foo@loop`; `foo: ... .loop:`
  defines `foo.loop`). Colon is required on definition — this also
  distinguishes `.loop:` from directives like `.org` / `.db`.
- Add `$` symbol: evaluates to the current address in any expression.
- Fix: `equ` labels no longer reset the local-label scope, so
  `len equ $ - .start` correctly references `.start` in the enclosing scope.
