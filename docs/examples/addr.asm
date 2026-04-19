; `$` evaluates to the address of the current instruction/directive.

length equ end_of_data - start_of_data

    org 0100h

start:
    mvi a, length              ; A = 8
    call 0f815h                ; print length in hex
    jmp 0f86ch

start_of_data:
    db 1, 2, 3, 4, 5, 6, 7, 8
end_of_data:
