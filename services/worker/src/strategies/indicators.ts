import { average, type Candle } from "@tradeplatformcodex/shared";

export function ema(values: number[], period: number): number[] {
  if (values.length === 0) {
    return [];
  }
  const multiplier = 2 / (period + 1);
  const result: number[] = [values[0] ?? 0];
  for (let index = 1; index < values.length; index += 1) {
    const previous = result[index - 1] ?? values[index];
    result.push(((values[index] ?? previous) - previous) * multiplier + previous);
  }
  return result;
}

export function rsi(values: number[], period = 14): number[] {
  if (values.length <= period) {
    return [];
  }
  const result: number[] = [];
  for (let index = period; index < values.length; index += 1) {
    const slice = values.slice(index - period + 1, index + 1);
    const changes = slice.slice(1).map((value, i) => value - (slice[i] ?? value));
    const gains = changes.filter((change) => change > 0);
    const losses = changes.filter((change) => change < 0).map(Math.abs);
    const avgGain = average(gains);
    const avgLoss = average(losses);
    result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  }
  return result;
}

export function macd(values: number[]): { macdLine: number; signalLine: number; histogram: number } {
  const ema12 = ema(values, 12);
  const ema26 = ema(values, 26);
  const line = values.map((_, index) => (ema12[index] ?? 0) - (ema26[index] ?? 0));
  const signal = ema(line, 9);
  const macdLine = line.at(-1) ?? 0;
  const signalLine = signal.at(-1) ?? 0;
  return { macdLine, signalLine, histogram: macdLine - signalLine };
}

// Wilder's smoothing (RMA): the moving average used by ADX/DI. Seeds on the
// first value and converges; alpha = 1/period rather than EMA's 2/(period+1).
function rma(values: number[], period: number): number[] {
  if (values.length === 0) {
    return [];
  }
  const alpha = 1 / period;
  const result: number[] = [values[0] ?? 0];
  for (let index = 1; index < values.length; index += 1) {
    const previous = result[index - 1] ?? values[index] ?? 0;
    result.push(((values[index] ?? previous) - previous) * alpha + previous);
  }
  return result;
}

// ADX + directional indicators. ADX measures trend STRENGTH (how hard price is
// moving regardless of direction); +DI/-DI give the direction. ADX below ~20
// means chop where trend-following entries whipsaw.
export function adx(candles: Candle[], period = 14): { adx: number; plusDI: number; minusDI: number } {
  if (candles.length <= period + 1) {
    return { adx: 0, plusDI: 0, minusDI: 0 };
  }
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  const trueRange: number[] = [];
  for (let index = 1; index < candles.length; index += 1) {
    const current = candles[index];
    const previous = candles[index - 1];
    if (!current || !previous) {
      continue;
    }
    const upMove = current.high - previous.high;
    const downMove = previous.low - current.low;
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    trueRange.push(
      Math.max(current.high - current.low, Math.abs(current.high - previous.close), Math.abs(current.low - previous.close))
    );
  }
  const trRma = rma(trueRange, period);
  const plusRma = rma(plusDM, period);
  const minusRma = rma(minusDM, period);
  const dx = trRma.map((tr, index) => {
    const safeTr = tr || 1e-10;
    const plus = 100 * ((plusRma[index] ?? 0) / safeTr);
    const minus = 100 * ((minusRma[index] ?? 0) / safeTr);
    return (100 * Math.abs(plus - minus)) / Math.max(plus + minus, 1e-10);
  });
  const adxSeries = rma(dx, period);
  const lastTr = trRma.at(-1) || 1e-10;
  return {
    adx: adxSeries.at(-1) ?? 0,
    plusDI: 100 * ((plusRma.at(-1) ?? 0) / lastTr),
    minusDI: 100 * ((minusRma.at(-1) ?? 0) / lastTr)
  };
}

// On-Balance Volume: running sum that adds the bar's volume on up closes and
// subtracts it on down closes. Direction-aware, unlike a raw volume magnitude
// check — rising OBV means buying pressure is actually flowing with price.
export function obv(candles: Candle[]): number[] {
  const result: number[] = [];
  let accumulator = 0;
  for (let index = 0; index < candles.length; index += 1) {
    const current = candles[index];
    const previous = candles[index - 1];
    if (current && previous) {
      const change = current.close - previous.close;
      accumulator += change > 0 ? current.volume : change < 0 ? -current.volume : 0;
    }
    result.push(accumulator);
  }
  return result;
}

export function hasBullishShakeout(candles: Candle[], lookback = 12): boolean {
  const latest = candles.at(-1);
  if (!latest) {
    return false;
  }
  const recent = candles.slice(-lookback - 1, -1);
  const recentLow = Math.min(...recent.map((candle) => candle.low));
  const avgVolume = average(recent.map((candle) => candle.volume));
  return latest.low < recentLow && latest.close > recentLow && latest.volume > avgVolume * 1.15;
}

export function hasBearishShakeout(candles: Candle[], lookback = 12): boolean {
  const latest = candles.at(-1);
  if (!latest) {
    return false;
  }
  const recent = candles.slice(-lookback - 1, -1);
  const recentHigh = Math.max(...recent.map((candle) => candle.high));
  const avgVolume = average(recent.map((candle) => candle.volume));
  return latest.high > recentHigh && latest.close < recentHigh && latest.volume > avgVolume * 1.15;
}

