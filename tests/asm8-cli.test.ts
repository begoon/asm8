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

describe("CLI: --format tape wrappers", () => {
  // Golden payload `lxi h, 0` = 21 00 00. Per the RK86 checksum algo
  // (first byte feeds both halves, trailing zeros are no-ops) this is 2121h.
  test(".rk wraps addr header + E6 + big-endian checksum", () => {
    const a = write("tiny.asm", "org 3000h\nlxi h, 0\nend\n");
    const outDir = join(TMP, "out-rk");
    const r = run([a, "--format", "rk", "-o", outDir]);
    expect(r.code).toBe(0);
    const b = readFileSync(join(outDir, "tiny.rk"));
    expect(Array.from(b)).toEqual([
      0x30,
      0x00,
      0x30,
      0x02, // start..end (inclusive)
      0x21,
      0x00,
      0x00, // payload
      0xe6,
      0x21,
      0x21, // sync + cs_hi + cs_lo
    ]);
  });

  test(".rkr is identical to .rk layout, just the extension differs", () => {
    const a = write("tiny2.asm", "org 3000h\nlxi h, 0\nend\n");
    const outDir = join(TMP, "out-rkr");
    const r = run([a, "--format", "rkr", "-o", outDir]);
    expect(r.code).toBe(0);
    const b = readFileSync(join(outDir, "tiny2.rkr"));
    expect(Array.from(b)).toEqual([
      0x30, 0x00, 0x30, 0x02, 0x21, 0x00, 0x00, 0xe6, 0x21, 0x21,
    ]);
  });

  test(".pki prepends a leading E6 sync byte to the rk layout", () => {
    const a = write("tiny3.asm", "org 3000h\nlxi h, 0\nend\n");
    const outDir = join(TMP, "out-pki");
    const r = run([a, "--format", "pki", "-o", outDir]);
    expect(r.code).toBe(0);
    const b = readFileSync(join(outDir, "tiny3.pki"));
    expect(Array.from(b)).toEqual([
      0xe6, // leading sync
      0x30,
      0x00,
      0x30,
      0x02,
      0x21,
      0x00,
      0x00,
      0xe6,
      0x21,
      0x21,
    ]);
  });

  test(".gam is identical to .pki layout", () => {
    const a = write("tiny4.asm", "org 3000h\nlxi h, 0\nend\n");
    const outDir = join(TMP, "out-gam");
    const r = run([a, "--format", "gam", "-o", outDir]);
    expect(r.code).toBe(0);
    const b = readFileSync(join(outDir, "tiny4.gam"));
    expect(Array.from(b)).toEqual([
      0xe6, 0x30, 0x00, 0x30, 0x02, 0x21, 0x00, 0x00, 0xe6, 0x21, 0x21,
    ]);
  });

  test("non-bin formats pack tight (no leading zero fill for org 3000h)", () => {
    const a = write("tight.asm", "org 3000h\ndb 1,2,3\nend\n");
    const outDir = join(TMP, "out-tight");
    const r = run([a, "--format", "rk", "-o", outDir]);
    expect(r.code).toBe(0);
    const b = readFileSync(join(outDir, "tight.rk"));
    expect(b.length).toBe(4 + 3 + 3); // header + payload + trailer
    expect(b[0]).toBe(0x30); // start high byte of 3000h
    expect(b[1]).toBe(0x00);
  });

  test(".bin (default) still zero-fills from addr 0 (legacy behavior)", () => {
    const a = write("legacy.asm", "org 100h\nhlt\nend\n");
    const outDir = join(TMP, "out-legacy");
    const r = run([a, "-o", outDir]);
    expect(r.code).toBe(0);
    const b = readFileSync(join(outDir, "legacy.bin"));
    expect(b.length).toBe(0x101);
    expect(b[0x100]).toBe(0x76);
  });

  test("--format rejects multi-file output when --split + multiple sections", () => {
    const a = write("multi.asm", "org 100h\ndb 1\norg 200h\ndb 2\nend\n");
    const outDir = join(TMP, "out-multi");
    const r = run([a, "--split", "--format", "rk", "-o", outDir]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("--format=rk");
    expect(r.stderr).toContain("single file");
  });

  test("--format rk + --split with a single section writes one .rk", () => {
    const a = write("one.asm", "org 3000h\nlxi h, 0\nend\n");
    const outDir = join(TMP, "out-split-one");
    const r = run([a, "--split", "--format", "rk", "-o", outDir]);
    expect(r.code).toBe(0);
    const b = readFileSync(join(outDir, "one.rk"));
    expect(Array.from(b).slice(0, 4)).toEqual([0x30, 0x00, 0x30, 0x02]);
  });

  test("unknown --format value errors out", () => {
    const a = write("unk.asm", "org 0\nhlt\nend\n");
    const r = run([a, "--format", "hex", "-o", join(TMP, "out-unk")]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("unknown --format: hex");
  });

  test("--format is case-insensitive", () => {
    const a = write("case.asm", "org 3000h\nlxi h, 0\nend\n");
    const outDir = join(TMP, "out-case");
    const r = run([a, "--format", "RK", "-o", outDir]);
    expect(r.code).toBe(0);
    expect(() => readFileSync(join(outDir, "case.rk"))).not.toThrow();
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
