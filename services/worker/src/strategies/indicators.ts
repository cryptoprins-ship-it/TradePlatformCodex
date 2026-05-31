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

// Average True Range (Wilder): the smoothed true-range, a direction-agnostic
// volatility yardstick. Used to judge whether a single bar's range is abnormal.
export function atr(candles: Candle[], period = 14): number {
  if (candles.length < 2) {
    return 0;
  }
  const trueRange: number[] = [];
  for (let index = 1; index < candles.length; index += 1) {
    const current = candles[index];
    const previous = candles[index - 1];
    if (!current || !previous) {
      continue;
    }
    trueRange.push(
      Math.max(current.high - current.low, Math.abs(current.high - previous.close), Math.abs(current.low - previous.close))
    );
  }
  return rma(trueRange, period).at(-1) ?? 0;
}

// Flash-wick / liquidation-spike detector: the latest bar's range dwarfs recent
// volatility (range > atrMult * ATR) while its body is a small fraction of that
// range (body < bodyMaxRatio * range). ATR is measured on the prior bars so the
// spike itself does not inflate the baseline it is compared against.
export function isFlashWick(candles: Candle[], atrMult: number, bodyMaxRatio: number): boolean {
  const latest = candles.at(-1);
  if (!latest) {
    return false;
  }
  const baseline = atr(candles.slice(0, -1));
  if (baseline <= 0) {
    return false;
  }
  const range = latest.high - latest.low;
  const body = Math.abs(latest.close - latest.open);
  return range > atrMult * baseline && body < range * bodyMaxRatio;
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

// Most recent EMA cross within `lookback` bars: fast crossing above slow is
// BULLISH, below is BEARISH. Scans newest-first and returns the first cross found,
// or null if the pair hasn't crossed inside the window (a long-established trend).
export function recentEmaCross(
  closes: number[],
  fast: number,
  slow: number,
  lookback: number
): "BULLISH" | "BEARISH" | null {
  const fastSeries = ema(closes, fast);
  const slowSeries = ema(closes, slow);
  const start = closes.length - 1;
  const end = Math.max(1, closes.length - lookback);
  for (let index = start; index >= end; index -= 1) {
    const current = (fastSeries[index] ?? 0) - (slowSeries[index] ?? 0);
    const previous = (fastSeries[index - 1] ?? 0) - (slowSeries[index - 1] ?? 0);
    if (previous <= 0 && current > 0) {
      return "BULLISH";
    }
    if (previous >= 0 && current < 0) {
      return "BEARISH";
    }
  }
  return null;
}

// Anchored VWAP: volume-weighted average of the typical price ((H+L+C)/3) since
// the start of the latest bar's UTC day. Crypto trades 24/7, so the UTC day is the
// session anchor. Returns null when the window carries no volume. Intraday/scalp
// reference for where the real traded value sits.
export function anchoredVwap(candles: Candle[]): number | null {
  const last = candles.at(-1);
  if (!last) {
    return null;
  }
  const day = last.openTime;
  const anchor = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
  let priceVolume = 0;
  let volume = 0;
  for (const candle of candles) {
    if (candle.openTime.getTime() < anchor) {
      continue;
    }
    const typical = (candle.high + candle.low + candle.close) / 3;
    priceVolume += typical * candle.volume;
    volume += candle.volume;
  }
  return volume <= 0 ? null : priceVolume / volume;
}

function standardDeviation(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const mean = average(values);
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
}

// Bollinger Bands: SMA midline +/- k standard deviations. The volatility envelope
// that, compared against Keltner, reveals a squeeze.
export function bollinger(values: number[], period = 20, k = 2): { mid: number; upper: number; lower: number } {
  const slice = values.slice(-period);
  const mid = average(slice);
  const deviation = standardDeviation(slice);
  return { mid, upper: mid + k * deviation, lower: mid - k * deviation };
}

// Squeeze (TTM-style): Bollinger Bands contained entirely inside the Keltner
// Channel = volatility compression. A squeeze that releases on the next bar tends
// to precede an expansion move, which the scoring engine rewards.
export function isInSqueeze(candles: Candle[], period = 20, bbK = 2, kcMult = 1.5): boolean {
  const closes = candles.map((candle) => candle.close);
  if (closes.length < period) {
    return false;
  }
  const bands = bollinger(closes, period, bbK);
  const midKc = ema(closes, period).at(-1) ?? bands.mid;
  const range = atr(candles, period);
  if (range <= 0) {
    return false;
  }
  return bands.upper < midKc + kcMult * range && bands.lower > midKc - kcMult * range;
}

// Most recent confirmed swing low: a bar whose low is the lowest within `lookback`
// bars on EACH side. Confirmation needs `lookback` bars to its right, so the
// newest possible swing sits at least `lookback` bars back. Returns the level or
// null if none is confirmed. Swing high is the mirror (highest high both sides).
export function findSwingLow(candles: Candle[], lookback = 5): number | null {
  for (let index = candles.length - 1 - lookback; index >= lookback; index -= 1) {
    const pivot = candles[index];
    if (!pivot) {
      continue;
    }
    let isSwing = true;
    for (let side = index - lookback; side <= index + lookback; side += 1) {
      if (side === index) {
        continue;
      }
      if ((candles[side]?.low ?? Infinity) < pivot.low) {
        isSwing = false;
        break;
      }
    }
    if (isSwing) {
      return pivot.low;
    }
  }
  return null;
}

export function findSwingHigh(candles: Candle[], lookback = 5): number | null {
  for (let index = candles.length - 1 - lookback; index >= lookback; index -= 1) {
    const pivot = candles[index];
    if (!pivot) {
      continue;
    }
    let isSwing = true;
    for (let side = index - lookback; side <= index + lookback; side += 1) {
      if (side === index) {
        continue;
      }
      if ((candles[side]?.high ?? -Infinity) > pivot.high) {
        isSwing = false;
        break;
      }
    }
    if (isSwing) {
      return pivot.high;
    }
  }
  return null;
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

