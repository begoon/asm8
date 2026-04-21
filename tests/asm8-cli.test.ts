import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TMP = join(import.meta.dir, "..", ".test-tmp-cli");
const ASM = join(import.meta.dir, "..", "asm8.ts");

function run(args: string[]): { code: number; stdout: string; stderr: string } {
  const proc = Bun.spawnSync({
    cmd: ["bun", "run", ASM, ...args],
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    code: proc.exitCode ?? -1,
    stdout: new TextDecoder().decode(proc.stdout),
    stderr: new TextDecoder().decode(proc.stderr),
  };
}

function write(name: string, content: string): string {
  const p = join(TMP, name);
  writeFileSync(p, content);
  return p;
}

beforeAll(() => {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
});

afterAll(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe("CLI: multiple input files", () => {
  test("two files are concatenated and base comes from first", () => {
    const a = write("first.asm", "org 0\nmvi a, 1\n");
    const b = write("second.asm", "mvi b, 2\nhlt\nend\n");
    const outDir = join(TMP, "out-concat");
    const r = run([a, b, "-o", outDir]);
    expect(r.code).toBe(0);

    const bin = readFileSync(join(outDir, "first.bin"));
    // MVI A,1 = 3E 01 ; MVI B,2 = 06 02 ; HLT = 76
    expect(Array.from(bin)).toEqual([0x3e, 0x01, 0x06, 0x02, 0x76]);
  });

  test("symbols from earlier file resolve in later file", () => {
    const a = write("defs.asm", "FOO equ 42h\norg 100h\n");
    const b = write("use.asm", "mvi a, FOO\nhlt\nend\n");
    const outDir = join(TMP, "out-symbols");
    const r = run([a, b, "-o", outDir]);
    expect(r.code).toBe(0);

    const bin = readFileSync(join(outDir, "defs.bin"));
    // first 0x100 bytes are zero padding, then 3E 42 76
    expect(bin.length).toBe(0x103);
    expect(bin[0x100]).toBe(0x3e);
    expect(bin[0x101]).toBe(0x42);
    expect(bin[0x102]).toBe(0x76);
  });

  test("-l also works with multiple files and uses first file's base", () => {
    const a = write("alpha.asm", "org 0\nnop\n");
    const b = write("beta.asm", "hlt\nend\n");
    const outDir = join(TMP, "out-l");
    const r = run([a, b, "-l", "-o", outDir]);
    expect(r.code).toBe(0);

    // All aux files use the first filename's base
    expect(() => readFileSync(join(outDir, "alpha.bin"))).not.toThrow();
    expect(() => readFileSync(join(outDir, "alpha.lst"))).not.toThrow();
    expect(() => readFileSync(join(outDir, "alpha.sym"))).not.toThrow();
    expect(() => readFileSync(join(outDir, "alpha.map"))).not.toThrow();
    expect(() => readFileSync(join(outDir, "alpha.json"))).not.toThrow();

    const lst = readFileSync(join(outDir, "alpha.lst"), "utf-8");
    expect(lst).toContain("nop");
    expect(lst).toContain("hlt");
  });

  test("-l writes structured .json with addr/bytes/chars/op/args/data/comment", () => {
    const src = [
      "        org 100h",
      "start:  mvi a, 42h      ; load",
      "        jmp done",
      "done:   hlt",
      "msg:    db  'Hi', 0",
      "        end",
      "",
    ].join("\n");
    const a = write("j.asm", src);
    const outDir = join(TMP, "out-json");
    const r = run([a, "-l", "-o", outDir]);
    expect(r.code).toBe(0);

    const j = JSON.parse(readFileSync(join(outDir, "j.json"), "utf-8"));
    expect(Object.keys(j).sort()).toEqual(["code", "map", "symbols"]);

    const org = j.code.find((e: any) => e.op === "org");
    expect(org).toMatchObject({ addr: "0100", arg1: "100h" });

    const mvi = j.code.find((e: any) => e.op === "mvi");
    expect(mvi).toMatchObject({
      label: "start",
      addr: "0100",
      bytes: "3E 42",
      arg1: "a",
      arg2: "42h",
      comment: "; load",
    });
    expect(mvi.chars).toHaveLength(2);

    const jmp = j.code.find((e: any) => e.op === "jmp");
    expect(jmp).toMatchObject({
      addr: "0102",
      bytes: "C3 05 01",
      arg1: "done",
    });

    const db = j.code.find((e: any) => e.op === "db");
    expect(db).toMatchObject({
      label: "msg",
      addr: "0106",
      bytes: "48 69 00",
      chars: "Hi.",
      data: "'Hi', 0",
    });

    expect(j.symbols).toMatchObject({
      START: "0100",
      DONE: "0105",
      MSG: "0106",
    });

    expect(j.map).toEqual({
      sections: [{ start: "0100", end: "0108", size: 9 }],
      total: 9,
    });
  });

  test("usage error when no input files given", () => {
    const r = run(["-o", join(TMP, "out-empty")]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("Usage:");
  });

  test("single file still works (regression)", () => {
    const a = write("solo.asm", "org 0\nhlt\nend\n");
    const outDir = join(TMP, "out-solo");
    const r = run([a, "-o", outDir]);
    expect(r.code).toBe(0);
    const bin = readFileSync(join(outDir, "solo.bin"));
    expect(Array.from(bin)).toEqual([0x76]);
  });
});

describe("CLI: error reporting and overlap", () => {
  test("syntax error prints clickable file:line:col", () => {
    const a = write("bad.asm", "org 0\nmvi a, UNDEFINED\nhlt\nend\n");
    const r = run([a, "-o", join(TMP, "out-bad")]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain(`${a}:2:`);
    expect(r.stderr).toContain("unknown symbol: UNDEFINED");
    expect(r.stderr).toContain("mvi a, UNDEFINED");
  });

  test("overlapping sections bail out with error", () => {
    const a = write(
      "overlap.asm",
      "org 100h\ndb 1,2,3,4,5\norg 102h\ndb 99,98\nend\n",
    );
    const r = run([a, "-o", join(TMP, "out-overlap")]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("sections overlap");
  });
});
