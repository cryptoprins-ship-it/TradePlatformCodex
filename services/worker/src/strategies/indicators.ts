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

