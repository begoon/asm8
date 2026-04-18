# Changelog

## 2026-04-18

- Add local labels: `@name:` and `.name:` scope to the most recent
  non-local label (e.g. `foo: ... @loop:` defines `foo@loop`; `foo: ... .loop:`
  defines `foo.loop`). Colon is required on definition — this also
  distinguishes `.loop:` from directives like `.org` / `.db`.
- Add `$` symbol: evaluates to the current address in any expression.
- Fix: `equ` labels no longer reset the local-label scope, so
  `len equ $ - .start` correctly references `.start` in the enclosing scope.
