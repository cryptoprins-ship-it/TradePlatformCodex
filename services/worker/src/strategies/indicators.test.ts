import { describe, expect, it } from "vitest";
import type { Candle } from "@tradeplatformcodex/shared";
import { adx, ema, macd, obv, rsi } from "./indicators";

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
});
