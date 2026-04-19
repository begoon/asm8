import helloSource from "./examples/hello.asm" with { type: "text" };
import sectionsSource from "./examples/sections.asm" with { type: "text" };
import expressionsSource from "./examples/expressions.asm" with { type: "text" };
import addrSource from "./examples/addr.asm" with { type: "text" };
import localsSource from "./examples/locals.asm" with { type: "text" };
import ifelseSource from "./examples/ifelse.asm" with { type: "text" };
import okSource from "./examples/ok.asm" with { type: "text" };
import procSource from "./examples/proc.asm" with { type: "text" };
import procRetSource from "./examples/proc-ret.asm" with { type: "text" };
import procJmpSource from "./examples/proc-jmp.asm" with { type: "text" };
import sokobanSource from "../sokoban.asm" with { type: "text" };

export interface Example {
  name: string;
  filename: string;
  source: string;
}

export const EXAMPLES: Example[] = [
  { name: "hello", filename: "hello.asm", source: helloSource },
  { name: "ok", filename: "ok.asm", source: okSource },
  { name: "sections", filename: "sections.asm", source: sectionsSource },
  { name: "expressions", filename: "expressions.asm", source: expressionsSource },
  { name: "$ (current address)", filename: "addr.asm", source: addrSource },
  { name: "local labels (@ and .)", filename: "locals.asm", source: localsSource },
  { name: "if / else (nested)", filename: "ifelse.asm", source: ifelseSource },
  { name: "proc / endp / return", filename: "proc.asm", source: procSource },
  { name: "proc: .return -> RET (no saves)", filename: "proc-ret.asm", source: procRetSource },
  { name: "proc: .return -> JMP exit (with saves)", filename: "proc-jmp.asm", source: procJmpSource },
  { name: "sokoban", filename: "sokoban.asm", source: sokobanSource },
];
