import { describe, expect, it } from "vitest";
import { formatDailyReport, summarizeDay } from "./daily-report";

describe("summarizeDay", () => {
  it("aggregates winrate, P/L and profit factor from closed trades", () => {
    const stats = summarizeDay([
      { result: "WIN", pnlPercentage: 2, pnlAmount: 20, riskReward: 2 },
      { result: "WIN", pnlPercentage: 1, pnlAmount: 10, riskReward: 1.5 },
      { result: "LOSS", pnlPercentage: -1, pnlAmount: -10, riskReward: 1 }
    ]);

    expect(stats.trades).toBe(3);
    expect(stats.wins).toBe(2);
    expect(stats.losses).toBe(1);
    expect(stats.winrate).toBeCloseTo((2 / 3) * 100);
    expect(stats.pnlPercentage).toBe(2);
    expect(stats.pnlAmount).toBe(20);
    expect(stats.profitFactor).toBe(3); // gross profit 3 / gross loss 1
    expect(stats.averageRiskReward).toBeCloseTo((2 + 1.5 + 1) / 3);
  });

  it("reports an all-zero day with no trades and no division blow-ups", () => {
    const stats = summarizeDay([]);

    expect(stats.trades).toBe(0);
    expect(stats.winrate).toBe(0);
    expect(stats.profitFactor).toBe(0);
    expect(stats.averageRiskReward).toBe(0);
  });

  it("uses gross profit as profit factor when there are no losses", () => {
    const stats = summarizeDay([{ result: "WIN", pnlPercentage: 4, pnlAmount: 40, riskReward: 2 }]);

    expect(stats.profitFactor).toBe(4);
  });
});

describe("formatDailyReport", () => {
  it("renders a per-strategy summary line block", () => {
    const message = formatDailyReport("Swing", "2026-05-30", {
      trades: 3,
      wins: 2,
      losses: 1,
      winrate: 66.666,
      pnlPercentage: 2,
      pnlAmount: 20,
      profitFactor: 3,
      averageRiskReward: 1.5
    });

    expect(message).toContain("Swing — daily report 2026-05-30");
    expect(message).toContain("Trades: 3 (2W / 1L)");
    expect(message).toContain("Winrate: 66.7%");
    expect(message).toContain("P/L: 2% (20 EUR)");
    expect(message).toContain("Profit factor: 3");
    expect(message).toContain("Mode: PAPER");
  });
});
