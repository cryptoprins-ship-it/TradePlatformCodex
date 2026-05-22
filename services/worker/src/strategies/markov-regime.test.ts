import { describe, expect, it } from "vitest";
import { type Candle } from "@tradeplatformcodex/shared";
import { assessMarkovRegime } from "./markov-regime";

function candlesFromCloses(closes: number[], timeframe: "1h" | "4h"): Candle[] {
  return closes.map((close, index) => ({
    symbol: "BTCUSDT",
    timeframe,
    openTime: new Date(Date.UTC(2026, 0, 1, index)),
    closeTime: new Date(Date.UTC(2026, 0, 1, index, 59)),
    open: index === 0 ? close : closes[index - 1] ?? close,
    high: close * 1.002,
    low: close * 0.998,
    close,
    volume: 100 + index
  }));
}

describe("assessMarkovRegime", () => {
  const options = { enabled: true, penalty: 25, volatilePenalty: 35 };

  it("does not penalize long signals in a bullish regime", () => {
    const closes = Array.from({ length: 120 }, (_, index) => 100 + index * 0.25);
    const assessment = assessMarkovRegime(candlesFromCloses(closes, "1h"), candlesFromCloses(closes, "4h"), "LONG", options);

    expect(assessment.regime).toBe("BULL");
    expect(assessment.penalty).toBe(0);
    expect(assessment.moduleScore.score).toBe(0);
  });

  it("penalizes long signals in a bearish regime", () => {
    const closes = Array.from({ length: 120 }, (_, index) => 130 - index * 0.25);
    const assessment = assessMarkovRegime(candlesFromCloses(closes, "1h"), candlesFromCloses(closes, "4h"), "LONG", options);

    expect(assessment.regime).toBe("BEAR");
    expect(assessment.penalty).toBe(25);
    expect(assessment.moduleScore.score).toBe(-25);
  });

  it("uses the larger penalty for volatile regimes", () => {
    const closes = Array.from({ length: 120 }, (_, index) => 100 + (index % 2 === 0 ? 4 : -4));
    const assessment = assessMarkovRegime(candlesFromCloses(closes, "1h"), candlesFromCloses(closes, "4h"), "SHORT", options);

    expect(assessment.regime).toBe("VOLATILE");
    expect(assessment.penalty).toBe(35);
    expect(assessment.moduleScore.score).toBe(-35);
  });
});
