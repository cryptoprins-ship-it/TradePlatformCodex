import { describe, expect, it } from "vitest";
import type { Candle } from "@tradeplatformcodex/shared";
import { adx, atr, bollinger, ema, isFlashWick, isInSqueeze, macd, obv, rsi } from "./indicators";

function candle(close: number, volume = 100): Candle {
  return {
    symbol: "BTCUSDT",
    timeframe: "5m",
    openTime: new Date(0),
    closeTime: new Date(0),
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume
  };
}

describe("indicators", () => {
  const closes = Array.from({ length: 60 }, (_, index) => 100 + index);

  it("calculates EMA values", () => {
    const values = ema(closes, 10);

    expect(values).toHaveLength(closes.length);
    expect(values.at(-1)).toBeGreaterThan(values[0] ?? 0);
  });

  it("calculates RSI for rising prices", () => {
    const values = rsi(closes);

    expect(values.length).toBeGreaterThan(0);
    expect(values.at(-1)).toBeGreaterThan(90);
  });

  it("calculates MACD momentum", () => {
    const result = macd(closes);

    expect(result.macdLine).toBeGreaterThan(result.signalLine);
    expect(result.histogram).toBeGreaterThan(0);
  });

  it("reports a strong uptrend via ADX and +DI dominance", () => {
    const upCandles = Array.from({ length: 60 }, (_, index) => candle(100 + index));

    const result = adx(upCandles);

    expect(result.plusDI).toBeGreaterThan(result.minusDI);
    expect(result.adx).toBeGreaterThan(20);
  });

  it("reports -DI dominance in a downtrend", () => {
    const downCandles = Array.from({ length: 60 }, (_, index) => candle(160 - index));

    const result = adx(downCandles);

    expect(result.minusDI).toBeGreaterThan(result.plusDI);
  });

  it("accumulates OBV up on rising closes and down on falling closes", () => {
    const rising = Array.from({ length: 30 }, (_, index) => candle(100 + index));
    const falling = Array.from({ length: 30 }, (_, index) => candle(130 - index));

    const risingObv = obv(rising);
    const fallingObv = obv(falling);

    expect(risingObv.at(-1)).toBeGreaterThan(risingObv[0] ?? 0);
    expect(fallingObv.at(-1)).toBeLessThan(fallingObv[0] ?? 0);
  });

  it("measures ATR as positive and larger for wider ranges", () => {
    const tight = Array.from({ length: 30 }, (_, index) => candle(100 + index));
    const wide = Array.from({ length: 30 }, (_, index) => ({
      ...candle(100 + index),
      high: 100 + index + 5,
      low: 100 + index - 5
    }));

    expect(atr(tight)).toBeGreaterThan(0);
    expect(atr(wide)).toBeGreaterThan(atr(tight));
  });

  it("flags a flash wick: a huge-range, small-body bar after calm volatility", () => {
    const calm = Array.from({ length: 30 }, (_, index) => candle(100 + index));
    const spike: Candle = {
      ...candle(130),
      // Range of 40 dwarfs the ~2-wide baseline; the body (open~close) is tiny.
      open: 130,
      close: 130.5,
      high: 150,
      low: 110
    };

    expect(isFlashWick([...calm, spike], 3, 0.35)).toBe(true);
    // A normal bar of the same series is not a flash wick.
    expect(isFlashWick(calm, 3, 0.35)).toBe(false);
  });

  it("does not flag a wide bar with a full body as a flash wick", () => {
    const calm = Array.from({ length: 30 }, (_, index) => candle(100 + index));
    const trend: Candle = { ...candle(130), open: 110, close: 150, high: 151, low: 109 };

    // Range is large but the body fills it (a real move, not a wick) -> not blocked.
    expect(isFlashWick([...calm, trend], 3, 0.35)).toBe(false);
  });

  it("computes Bollinger bands around the mean", () => {
    const flat = Array.from({ length: 20 }, () => 100);
    const bands = bollinger(flat, 20, 2);

    expect(bands.mid).toBe(100);
    expect(bands.upper).toBe(100); // zero variance -> bands collapse to the mean
    expect(bands.lower).toBe(100);
  });

  it("detects a squeeze in flat consolidation but not in a trend", () => {
    // Near-flat closes: tiny stdev -> Bollinger collapses well inside Keltner.
    const calm = Array.from({ length: 40 }, (_, index) => candle(100 + (index % 2 === 0 ? 0.05 : -0.05)));
    // Steady trend: stdev grows while ATR (bar-to-bar range) stays small, so
    // Bollinger expands outside Keltner -> no squeeze.
    const trend = Array.from({ length: 40 }, (_, index) => candle(100 + index * 2));

    expect(isInSqueeze(calm, 20, 2, 1.5)).toBe(true);
    expect(isInSqueeze(trend, 20, 2, 1.5)).toBe(false);
  });
});
