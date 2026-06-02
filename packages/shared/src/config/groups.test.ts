import { describe, expect, it } from "vitest";
import { SUPPORTED_SYMBOLS } from "./env";
import { SYMBOL_GROUPS, getSymbolGroup } from "./groups";

describe("symbol groups", () => {
  it("maps every supported symbol to a group", () => {
    for (const symbol of SUPPORTED_SYMBOLS) {
      expect(SYMBOL_GROUPS[symbol], `${symbol} has no group`).toBeDefined();
      expect(getSymbolGroup(symbol)).not.toBe("Other");
    }
  });

  it("does not map symbols outside the allowlist", () => {
    for (const symbol of Object.keys(SYMBOL_GROUPS)) {
      expect(SUPPORTED_SYMBOLS).toContain(symbol);
    }
  });

  it("falls back to Other for unknown symbols", () => {
    expect(getSymbolGroup("FAKEUSDT")).toBe("Other");
  });
});
