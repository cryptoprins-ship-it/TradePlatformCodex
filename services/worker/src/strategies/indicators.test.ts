import { describe, expect, it } from "vitest";
import { ema, macd, rsi } from "./indicators";

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
});
