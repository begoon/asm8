export interface Example {
  name: string;
  filename: string;
  source: Promise<string>;
}

// Each example's `source` is the Promise returned by fetchExample — all
// fetches are kicked off in parallel at module load, and consumers `await`
// the one they need. Files live in ./examples/*.asm and can be edited
// without rebuilding the playground.
const fetchExample = (f: string): Promise<string> =>
  fetch(`examples/${f}`).then((r) => r.text());

function file(name: string, filename: string, src: string = ""): Example {
  return { name, filename, source: fetchExample(src || filename) };
}

export const EXAMPLES: Example[] = [
  file("aloha", "hello.asm"),
  file("ok", "ok.asm"),
  file("sections", "sections.asm"),
  file("expressions", "expressions.asm"),
  file("current address $", "addr.asm"),
  file("local labels @ and .", "locals.asm"),
  file("if / else", "ifelse.asm"),
  file("proc: .return -> RET (no saves)", "proc-ret.asm"),
  file("proc: .return -> JMP exit (with saves)", "proc-jmp.asm"),
  file("dump editor", "dumped.asm"),
  file("chars", "chars.asm"),
  file("noise", "noise.asm"),
  file("banner", "banner.asm"),
  file("pong", "pong.asm"),
  file("sokoban", "sokoban.asm"),
  file("volcano", "volcano.asm"),
  file("lestnica", "lestnica.asm"),
];
