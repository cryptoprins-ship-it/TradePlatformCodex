import { describe, expect, it } from "vitest";
import { loadConfig, type Candle, type Timeframe } from "@tradeplatformcodex/shared";
import { generateSignals } from "./scoring-engine";

function candlesFor(timeframe: Timeframe, symbol: Candle["symbol"] = "BTCUSDT"): Candle[] {
  const start = new Date("2026-05-01T00:00:00.000Z").getTime();
  return Array.from({ length: 250 }, (_, index) => {
    const close = 80_000 - index * 10;
    return {
      symbol,
      timeframe,
      openTime: new Date(start + index * 60_000),
      closeTime: new Date(start + (index + 1) * 60_000),
      open: close + 4,
      high: close + 8,
      low: close - 8,
      close,
      volume: 100 + index
    };
  });
}

describe("generateSignals", () => {
  it("scores no-sweep signals on merit instead of hard-capping them", () => {
    const config = loadConfig({
      ENABLE_LIVE_TRADING: "false",
      SYMBOLS: "BTCUSDT",
      MIN_CONFIDENCE_SCORE: "75"
    });
    const candlesByTimeframe = {
      "5m": candlesFor("5m"),
      "15m": candlesFor("15m"),
      "1h": candlesFor("1h"),
      "4h": candlesFor("4h")
    };

    const signals = generateSignals(config, "BTCUSDT", candlesByTimeframe);
    const signalsWithoutSweep = signals.filter((signal) => signal.reason.includes("no clean liquidity sweep"));

    expect(signalsWithoutSweep.length).toBeGreaterThan(0);
    // The setup-quality gate is gone: no module caps the score, and the old
    // "liquidity sweep required" penalty no longer appears.
    expect(signals.every((signal) => signal.moduleScores.every((module) => module.module !== "Setup quality gate"))).toBe(true);
    expect(signals.every((signal) => !signal.reason.includes("liquidity sweep required"))).toBe(true);
    // RSI was removed as a redundant momentum module; MACD now carries momentum.
    expect(signals.every((signal) => signal.moduleScores.every((module) => module.module !== "RSI filter"))).toBe(true);
    // Score is the honest clamped sum of the remaining modules, not MIN - 1.
    for (const signal of signalsWithoutSweep) {
      const expected = Math.max(0, Math.min(100, Math.round(signal.moduleScores.reduce((sum, module) => sum + module.score, 0))));
      expect(signal.score).toBe(expected);
    }
  });

  it("penalises a counter-trend trade via ADX strength and OBV pressure", () => {
    const config = loadConfig({ ENABLE_LIVE_TRADING: "false", SYMBOLS: "BTCUSDT" });
    const candlesByTimeframe = {
      "5m": candlesFor("5m"),
      "15m": candlesFor("15m"),
      "1h": candlesFor("1h"),
      "4h": candlesFor("4h")
    };

    const signals = generateSignals(config, "BTCUSDT", candlesByTimeframe);
    const long5m = signals.find((signal) => signal.timeframe === "5m" && signal.direction === "LONG");
    const short5m = signals.find((signal) => signal.timeframe === "5m" && signal.direction === "SHORT");

    // Candles trend down, so SHORT trades with the trend and LONG fights it.
    expect(short5m?.reason).toContain("OBV pressure flows with SHORT");
    expect(short5m?.reason).toMatch(/ADX .* confirms a strong SHORT trend/);
    expect(long5m?.reason).toContain("OBV pressure opposes the trade");
    expect(long5m?.reason).toMatch(/ADX .* (choppy|oppose)/);
    expect((short5m?.score ?? 0)).toBeGreaterThan(long5m?.score ?? 0);
  });

  it("generates signals for configured alt symbols", () => {
    const config = loadConfig({
      ENABLE_LIVE_TRADING: "false",
      SYMBOLS: "BTCUSDT,ETHUSDT,SOLUSDT,XRPUSDT,WLDUSDT"
    });
    const candlesByTimeframe = {
      "5m": candlesFor("5m", "WLDUSDT"),
      "15m": candlesFor("15m", "WLDUSDT"),
      "1h": candlesFor("1h", "WLDUSDT"),
      "4h": candlesFor("4h", "WLDUSDT")
    };

    const signals = generateSignals(config, "WLDUSDT", candlesByTimeframe);

    expect(signals).toHaveLength(4);
    expect(signals.every((signal) => signal.symbol === "WLDUSDT")).toBe(true);
  });
});
