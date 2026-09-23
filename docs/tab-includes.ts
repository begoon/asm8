import type { AsmOptions } from "../asm8";

// Tab names are literal, case-sensitive names, not filesystem paths.
export function tabIncludeOptions(
  tabs: readonly { filename: string; source: string }[],
  file: string,
): AsmOptions {
  return {
    file,
    readInclude(name) {
      const matches = tabs.filter((tab) => tab.filename === name);
      if (matches.length === 0) throw new Error(`no open tab named "${name}"`);
      if (matches.length > 1) throw new Error(`multiple tabs named "${name}"`);
      return { source: matches[0].source, resolvedFile: matches[0].filename };
    },
  };
}
