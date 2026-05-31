import { describe, expect, it } from "vitest";
import { selectEvictionTarget, type EvictionCandidate } from "./papertrading-engine";

const TOTAL_CAP = "max open trades reached (5)";
const SYMBOL_CAP = "max open trades per symbol reached (2)";

function trade(id: string, symbol: string, confidenceScore: number, openedAtMs = 0): EvictionCandidate {
  return { id, symbol, confidenceScore, openedAt: new Date(openedAtMs) };
}

describe("selectEvictionTarget", () => {
  const book = [
    trade("a", "BTCUSDT", 80),
    trade("b", "BTCUSDT", 70),
    trade("c", "ETHUSDT", 60)
  ];

  it("does not evict below the golden score", () => {
    expect(selectEvictionTarget(89, 90, [TOTAL_CAP], "BTCUSDT", book)).toBeNull();
  });

  it("evicts the globally weakest trade when the total cap is the only block", () => {
    const target = selectEvictionTarget(95, 90, [TOTAL_CAP], "BTCUSDT", book);
    expect(target?.id).toBe("c");
  });

  it("evicts the weakest trade of the same symbol when the per-symbol cap binds", () => {
    const target = selectEvictionTarget(95, 90, [SYMBOL_CAP], "BTCUSDT", book);
    // c (ETH, score 60) is weaker overall but the per-symbol cap binds BTC, so the
    // weakest BTC trade (b, 70) is evicted instead.
    expect(target?.id).toBe("b");
  });

  it("never evicts for a discipline limit (e.g. daily loss)", () => {
    expect(selectEvictionTarget(99, 90, ["daily loss limit reached (3%)"], "BTCUSDT", book)).toBeNull();
    expect(selectEvictionTarget(99, 90, [TOTAL_CAP, "max trades per day reached (3)"], "BTCUSDT", book)).toBeNull();
  });

  it("does not evict a trade the newcomer fails to outscore", () => {
    const strongBook = [trade("x", "BTCUSDT", 95)];
    expect(selectEvictionTarget(95, 90, [SYMBOL_CAP], "BTCUSDT", strongBook)).toBeNull();
  });

  it("breaks confidence ties by evicting the oldest trade", () => {
    const tied = [trade("new", "BTCUSDT", 70, 2_000), trade("old", "BTCUSDT", 70, 1_000)];
    const target = selectEvictionTarget(95, 90, [TOTAL_CAP], "BTCUSDT", tied);
    expect(target?.id).toBe("old");
  });

  it("returns null when there are no open trades to evict", () => {
    expect(selectEvictionTarget(95, 90, [TOTAL_CAP], "BTCUSDT", [] as EvictionCandidate[])).toBeNull();
  });
});
