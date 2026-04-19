# RK86 monitor subroutines

Jump table for the Radio-86RK monitor ROM at `F800h`. Each slot is a
3-byte `JMP entry_*` — call these addresses, not the `entry_*` labels,
since the jump table is the stable ABI.

Source: https://github.com/begoon/rk86-monitor/blob/main/monitor.asm

| Addr  | Name     | In                   | Out                  | Notes |
|-------|----------|----------------------|----------------------|-------|
| F803  | getc     | —                    | A = key code         | Blocks until a key is pressed. |
| F806  | inpb     | —                    | A = byte, CY on err  | Read one byte from tape. |
| F809  | putc     | C = char             | —                    | Write char to screen. Control codes and АР2 sequences handled. |
| F80C  | outb     | A = byte             | —                    | Write one byte to tape. |
| F80F  | —        | C = char             | —                    | Alias of putc (reserved slot). |
| F812  | kbhit    | —                    | A = 0 / key          | Non-blocking key poll. |
| F815  | hexb     | A = byte             | —                    | Print A as two hex digits. |
| F818  | puts     | HL = string ptr      | —                    | Print zero-terminated string. |
| F81B  | scan_kbd | —                    | A = FFh / FEh / code | FFh = none, FEh = РУС/ЛАТ, else key code. |
| F81E  | getxy    | —                    | HL = (y << 8) \| x   | Current cursor position. |
| F821  | curc     | —                    | A = char at cursor   | Screen char under cursor. |
| F824  | inpblock | HL = dst, BC = len   | CY on checksum err   | Read block from tape. |
| F827  | outblock | HL = src, BC = len   | —                    | Write block to tape. |
| F82A  | chksum   | HL = ptr, BC = len   | HL = sum             | Compute block checksum. |
| F82D  | video    | —                    | —                    | Reinitialize video controller. |
| F830  | getlim   | —                    | HL = top-of-mem      | Monitor's upper memory limit. |
| F833  | setlim   | HL = top-of-mem      | —                    | Change upper memory limit. |

## Useful non-jump-table entry points

| Addr  | Name         | Notes |
|-------|--------------|-------|
| F86C  | prompt_loop  | Monitor command prompt. `JMP F86Ch` = "exit back to monitor". |
| F836  | entry_start  | Cold start (banner + prompt). |

## Typical end-of-program pattern

```asm
    lxi h, msg
    call 0F818h      ; puts
    jmp 0F86Ch       ; back to monitor prompt

msg: db "hello, world", 0
```

## Registers clobbered

The ROM routines are not register-preserving. Save anything you need
across a call. `putc` in particular touches PSW, B, D, H internally.
