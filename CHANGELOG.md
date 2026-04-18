# Changelog

## 2026-04-18

- Add local labels: `@name:` scopes to the most recent non-local label
  (e.g. `foo: ... @loop:` defines `foo@loop`; `@loop` inside `foo`
  resolves to it). Colon is required on definition.
- Add `$` symbol: evaluates to the current address in any expression.
