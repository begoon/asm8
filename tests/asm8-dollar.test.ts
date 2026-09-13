import { expect, test } from "bun:test";
import { asm } from "../asm8";

function bytes(src: string): number[] {
  const sections = asm(src);
  expect(sections).toHaveLength(1);
  return sections[0].data;
}

test("$ in an instruction is the address of the instruction", () => {
  expect(bytes("org 100h\nlxi h, $\nlxi h, $\nend\n")).toEqual([
    0x21, 0x00, 0x01, 0x21, 0x03, 0x01,
  ]);
});

test("$ in a DW list is the address of the current word", () => {
  // fig-FORTH idiom: DW ZBRAN,TARGET-$ — the offset is relative to the
  // offset word itself, not to the start of the DW line.
  const src = [
    "org 088Bh",
    "dw 192h, ules1-$   ; IF",
    "dw 53Ch, 4B7h",
    "dw 4A3h",
    "dw 17Ah, ules2-$",
    "ules1: dw 847h, 4B7h ; ELSE",
    "ules2: dw 41h",
    "end",
  ].join("\n");
  const out = bytes(src);
  // 0899h - 088Dh = 000Ch
  expect(out.slice(2, 4)).toEqual([0x0c, 0x00]);
  // ules2 = 089Dh, offset word at 0897h -> 0006h
  expect(out.slice(12, 14)).toEqual([0x06, 0x00]);
});

test("DW list with $ matches the same words on separate lines", () => {
  const joined = bytes("org 1000h\ndw 1000, 2000-$\nend\n");
  const split = bytes("org 1000h\ndw 1000\ndw 2000-$\nend\n");
  expect(joined).toEqual(split);
});

test("$ in a DB list advances past strings and bytes", () => {
  // org 200h: "ab" occupies 200h-201h, then $ = 202h, then $ = 203h
  expect(bytes("org 200h\ndb 'ab', low($), low($), high($)\nend\n")).toEqual([
    0x61, 0x62, 0x02, 0x03, 0x02,
  ]);
  const joined = bytes("org 200h\ndb 'ab', low($), low($)\nend\n");
  const split = bytes("org 200h\ndb 'ab'\ndb low($)\ndb low($)\nend\n");
  expect(joined).toEqual(split);
});
