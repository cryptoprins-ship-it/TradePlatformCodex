import { average, round, type Candle, type Direction, type ModuleScore } from "@tradeplatformcodex/shared";

export type MarketRegime = "BULL" | "BEAR" | "SIDEWAYS" | "VOLATILE";

export interface MarkovRegimeAssessment {
  regime: MarketRegime;
  confidence: number;
  transitionProbability: number;
  meanReturn: number;
  volatility: number;
  aligned: boolean;
  penalty: number;
  moduleScore: ModuleScore;
}

interface MarkovRegimeOptions {
  enabled: boolean;
  penalty: number;
  volatilePenalty: number;
  // Classification cutoffs on the per-bar log-return scale. Optional so existing
  // callers keep today's tuning; per-strategy callers scale them to their bars.
  volatileThreshold?: number;
  sidewaysThreshold?: number;
}

const DEFAULT_VOLATILE_THRESHOLD = 0.0075;
const DEFAULT_SIDEWAYS_THRESHOLD = 0.00045;

const REGIMES: MarketRegime[] = ["BULL", "BEAR", "SIDEWAYS", "VOLATILE"];

function logReturns(candles: Candle[]): number[] {
  return candles.slice(1).map((candle, index) => {
    const previous = candles[index]?.close ?? candle.close;
    return previous <= 0 ? 0 : Math.log(candle.close / previous);
  });
}

function standardDeviation(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const mean = average(values);
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
}

function classifyWindow(returns: number[], volatileThreshold: number, sidewaysThreshold: number): MarketRegime {
  const meanReturn = average(returns);
  const volatility = standardDeviation(returns);
  const absoluteMean = Math.abs(meanReturn);

  if (volatility > volatileThreshold && absoluteMean < volatility * 0.45) {
    return "VOLATILE";
  }
  if (absoluteMean < sidewaysThreshold) {
    return "SIDEWAYS";
  }
  return meanReturn > 0 ? "BULL" : "BEAR";
}

function transitionProbability(states: MarketRegime[], current: MarketRegime): number {
  if (states.length < 2) {
    return 0.5;
  }

  const transitions = new Map<MarketRegime, number>();
  let fromCurrent = 0;
  for (let index = 1; index < states.length; index += 1) {
    if (states[index - 1] !== current) {
      continue;
    }
    fromCurrent += 1;
    const next = states[index] ?? current;
    transitions.set(next, (transitions.get(next) ?? 0) + 1);
  }

  if (fromCurrent === 0) {
    return 0.5;
  }
  return (transitions.get(current) ?? 0) / fromCurrent;
}

function confidenceFor(regime: MarketRegime, returns: number[], transition: number, volatileThreshold: number): number {
  const meanReturn = average(returns);
  const volatility = standardDeviation(returns);
  const trendStrength = volatility === 0 ? 0 : Math.min(Math.abs(meanReturn) / volatility, 1);
  // Normalise volatile-regime strength against the (per-strategy) volatile cutoff
  // so confidence scales with the same bar size the classifier uses.
  const volatilityStrength = regime === "VOLATILE" ? Math.min(volatility / (volatileThreshold * 1.6), 1) : trendStrength;
  const raw = (regime === "SIDEWAYS" ? 0.45 : volatilityStrength) * 0.65 + transition * 0.35;
  return round(Math.max(0, Math.min(raw, 1)), 3);
}

export function assessMarkovRegime(
  contextCandles: Candle[],
  higherContextCandles: Candle[],
  direction: Direction,
  options: MarkovRegimeOptions
): MarkovRegimeAssessment {
  const volatileThreshold = options.volatileThreshold ?? DEFAULT_VOLATILE_THRESHOLD;
  const sidewaysThreshold = options.sidewaysThreshold ?? DEFAULT_SIDEWAYS_THRESHOLD;
  const candles = [...contextCandles.slice(-90), ...higherContextCandles.slice(-60)];
  const returns = logReturns(candles).slice(-120);

  if (!options.enabled || returns.length < 30) {
    return {
      regime: "SIDEWAYS",
      confidence: 0,
      transitionProbability: 0,
      meanReturn: 0,
      volatility: 0,
      aligned: true,
      penalty: 0,
      moduleScore: {
        module: "Markov regime filter",
        score: 0,
        reason: options.enabled ? "not enough context candles for regime model" : "Markov regime disabled"
      }
    };
  }

  const states: MarketRegime[] = [];
  for (let index = 24; index <= returns.length; index += 1) {
    states.push(classifyWindow(returns.slice(index - 24, index), volatileThreshold, sidewaysThreshold));
  }

  const recentReturns = returns.slice(-36);
  const regime = classifyWindow(recentReturns, volatileThreshold, sidewaysThreshold);
  const transition = transitionProbability(states, regime);
  const confidence = confidenceFor(regime, recentReturns, transition, volatileThreshold);
  const aligned = regime === "BULL" ? direction === "LONG" : regime === "BEAR" ? direction === "SHORT" : regime === "SIDEWAYS";
  const penalty = regime === "VOLATILE" ? options.volatilePenalty : aligned ? 0 : options.penalty;
  const meanReturn = average(recentReturns);
  const volatility = standardDeviation(recentReturns);
  const score = penalty === 0 ? 0 : -Math.round(penalty);

  return {
    regime,
    confidence,
    transitionProbability: round(transition, 3),
    meanReturn: round(meanReturn, 6),
    volatility: round(volatility, 6),
    aligned,
    penalty,
    moduleScore: {
      module: "Markov regime filter",
      score,
      reason:
        penalty === 0
          ? `Markov regime ${regime} supports ${direction} or allows mean-reversion`
          : `Markov regime ${regime} penalizes ${direction} by ${penalty} points; confidence ${round(confidence * 100, 1)}%`
    }
  };
}
