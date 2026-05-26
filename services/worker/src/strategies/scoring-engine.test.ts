import { describe, expect, it } from "vitest";
import { loadConfig, type Candle, type Timeframe } from "@tradeplatformcodex/shared";
import { generateSignals } from "./scoring-engine";

function candlesFor(timeframe: Timeframe): Candle[] {
  const start = new Date("2026-05-01T00:00:00.000Z").getTime();
  return Array.from({ length: 250 }, (_, index) => {
    const close = 80_000 - index * 10;
    return {
      symbol: "BTCUSDT",
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
  it("caps signals without a liquidity sweep below the default trade threshold", () => {
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

    const signals = generateSignals(config, candlesByTimeframe);
    const signalsWithoutSweep = signals.filter((signal) => signal.reason.includes("no clean liquidity sweep"));

    expect(signalsWithoutSweep.length).toBeGreaterThan(0);
    expect(signalsWithoutSweep.every((signal) => signal.score <= 74)).toBe(true);
    expect(signalsWithoutSweep.every((signal) => signal.reason.includes("liquidity sweep required before papertrade"))).toBe(true);
  });
});
