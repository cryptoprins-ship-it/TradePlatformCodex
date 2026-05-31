import { describe, expect, it } from "vitest";
import { computePnlAmount, computePositionNotional } from "./position-sizing";

describe("computePositionNotional", () => {
  it("sizes so that a stop-out loses ~the intended risk amount", () => {
    // Balance 1000, risk 1% => 10 at risk. Stop 0.4% away.
    const entry = 100;
    const stop = 99.6; // 0.4% below
    const notional = computePositionNotional(1000, 1, entry, stop);

    expect(notional).toBeCloseTo(2500, 6); // 10 / 0.004
    // Stop hit => price moves -0.4% => loss = notional * -0.004 = -10 = 1% of balance.
    expect(computePnlAmount(notional, -0.4)).toBeCloseTo(-10, 6);
  });

  it("grows the notional as the stop tightens (same risk)", () => {
    const wide = computePositionNotional(1000, 1, 100, 99); // 1% stop
    const tight = computePositionNotional(1000, 1, 100, 99.8); // 0.2% stop

    expect(tight).toBeGreaterThan(wide);
  });

  it("scales with balance (compounding)", () => {
    const small = computePositionNotional(1000, 1, 100, 99.6);
    const big = computePositionNotional(2000, 1, 100, 99.6);

    expect(big).toBeCloseTo(small * 2, 6);
  });

  it("returns 0 for degenerate inputs", () => {
    expect(computePositionNotional(0, 1, 100, 99)).toBe(0);
    expect(computePositionNotional(1000, 0, 100, 99)).toBe(0);
    expect(computePositionNotional(1000, 1, 100, 100)).toBe(0); // zero stop distance
    expect(computePositionNotional(1000, 1, 0, 0)).toBe(0);
  });
});

describe("computePnlAmount", () => {
  it("scales the notional by the captured percentage move", () => {
    expect(computePnlAmount(2500, 1)).toBeCloseTo(25, 6);
    expect(computePnlAmount(2500, -0.4)).toBeCloseTo(-10, 6);
    expect(computePnlAmount(0, 5)).toBe(0);
  });
});
