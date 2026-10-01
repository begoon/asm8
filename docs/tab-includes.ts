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

// Walk `include` directives from `entry` through the open tabs and return
// every reachable tab in depth-first order, the entry tab first. Names are
// matched exactly like `tabIncludeOptions`; unresolved or ambiguous names
// are skipped (the assembler already reports them) and cycles are visited
// once.
export function includeClosure(
  tabs: readonly { filename: string; source: string }[],
  entry: string,
): { filename: string; source: string }[] {
  const out: { filename: string; source: string }[] = [];
  const seen = new Set<string>();
  const visit = (name: string) => {
    if (seen.has(name)) return;
    const matches = tabs.filter((tab) => tab.filename === name);
    if (matches.length !== 1) return;
    seen.add(name);
    const tab = matches[0];
    out.push(tab);
    for (const line of tab.source.split("\n")) {
      const m = line.match(/^\s*\.?include\s+(?:"([^"]*)"|'([^']*)')/i);
      if (m) visit(m[1] ?? m[2]);
    }
  };
  visit(entry);
  return out;
}
