// Risk-based position sizing. Each trade risks a fixed percentage of the
// (compounding) account balance; the notional follows from how far the stop
// sits from entry. A tighter stop => a larger notional for the same risk.
//
//   riskAmount   = balance * riskPercent%
//   stopDistance = |entry - stop| / entry        (fractional, e.g. 0.004)
//   notional     = riskAmount / stopDistance
//
// So if the stop is hit, the loss is ~riskAmount (the intended risk); the P/L in
// money is the notional times the captured price move.

export function computePositionNotional(
  balance: number,
  riskPercent: number,
  entryPrice: number,
  stopLoss: number
): number {
  if (balance <= 0 || riskPercent <= 0 || entryPrice <= 0) {
    return 0;
  }
  const stopDistance = Math.abs(entryPrice - stopLoss) / entryPrice;
  if (stopDistance <= 0) {
    return 0;
  }
  const riskAmount = balance * (riskPercent / 100);
  return riskAmount / stopDistance;
}

// Money P/L for a closed trade: the notional scaled by the percentage price move
// already captured in pnlPercentage (direction-adjusted at close).
export function computePnlAmount(positionNotional: number, pnlPercentage: number): number {
  return positionNotional * (pnlPercentage / 100);
}
