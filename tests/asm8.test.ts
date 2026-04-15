import { expect, test } from "bun:test";
import { asm } from "../asm8";

test("monitor.asm assembles to match mon32.bin", async () => {
  const source = await Bun.file("target/monitor.asm").text();
  const expected = new Uint8Array(
    await Bun.file("target/mon32.bin").arrayBuffer(),
  );

  const sections = asm(source);

  expect(sections).toHaveLength(1);
  expect(sections[0].start).toBe(0xf800);
  expect(sections[0].end).toBe(0xffff);
  expect(sections[0].data.length).toBe(2048);

  const actual = new Uint8Array(sections[0].data);
  for (let i = 0; i < expected.length; i++) {
    if (actual[i] !== expected[i]) {
      const addr = (0xf800 + i).toString(16).toUpperCase().padStart(4, "0");
      throw new Error(
        `First mismatch at offset ${i} (addr ${addr}): ` +
          `expected 0x${expected[i].toString(16).padStart(2, "0")}, ` +
          `got 0x${actual[i]?.toString(16).padStart(2, "0") ?? "undefined"}`,
      );
    }
  }
});
