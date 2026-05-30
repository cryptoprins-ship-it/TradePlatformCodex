import {
  average,
  round,
  type AppConfig,
  type Candle,
  type ModuleScore,
  type SupportedSymbol,
  type Timeframe,
  type TradingSignal
} from "@tradeplatformcodex/shared";
import { ema, hasBearishShakeout, hasBullishShakeout, macd, rsi } from "./indicators";
import { assessMarkovRegime, type MarketRegime } from "./markov-regime";

type CandleMap = Record<Timeframe, Candle[]>;

function latestClose(candles: Candle[]): number {
  return candles.at(-1)?.close ?? 0;
}

function trendScore(candles: Candle[], direction: "LONG" | "SHORT"): ModuleScore {
  const closes = candles.map((candle) => candle.close);
  const ema200 = ema(closes, 200).at(-1) ?? closes.at(-1) ?? 0;
  const price = latestClose(candles);
  const aligned = direction === "LONG" ? price > ema200 : price < ema200;
  return {
    module: "EMA200 trendfilter",
    score: aligned ? 20 : 5,
    reason: aligned ? `price ${direction === "LONG" ? "above" : "below"} EMA200` : "EMA200 context not aligned"
  };
}

function rsiScore(candles: Candle[], direction: "LONG" | "SHORT"): ModuleScore {
  const values = rsi(candles.map((candle) => candle.close));
  const current = values.at(-1) ?? 50;
  const previous = values.at(-2) ?? current;
  const aligned = direction === "LONG" ? current > previous && current < 70 : current < previous && current > 30;
  return {
    module: "RSI filter",
    score: aligned ? 15 : 4,
    reason: aligned ? `RSI momentum supports ${direction}` : `RSI at ${round(current, 2)} lacks confirmation`
  };
}

function macdScore(candles: Candle[], direction: "LONG" | "SHORT"): ModuleScore {
  const result = macd(candles.map((candle) => candle.close));
  const aligned = direction === "LONG" ? result.histogram > 0 : result.histogram < 0;
  return {
    module: "MACD momentum",
    score: aligned ? 15 : 4,
    reason: aligned ? "MACD histogram confirms momentum" : "MACD momentum missing"
  };
}

function volumeScore(candles: Candle[]): ModuleScore {
  const recent = candles.slice(-21, -1);
  const latest = candles.at(-1);
  const avgVolume = average(recent.map((candle) => candle.volume));
  const aligned = latest ? latest.volume > avgVolume * 1.1 : false;
  return {
    module: "Volume confirmation",
    score: aligned ? 15 : 3,
    reason: aligned ? "volume above recent average" : "volume confirmation missing"
  };
}

function wickScore(candles: Candle[], direction: "LONG" | "SHORT"): ModuleScore {
  const aligned = direction === "LONG" ? hasBullishShakeout(candles) : hasBearishShakeout(candles);
  return {
    module: "Wick shakeout",
    score: aligned ? 20 : 0,
    reason: aligned ? `${direction.toLowerCase()} liquidity sweep detected` : "no clean liquidity sweep"
  };
}

function timeframeScore(candlesByTimeframe: CandleMap, direction: "LONG" | "SHORT"): ModuleScore {
  const context = ["1h", "4h"] as const;
  const alignedCount = context.filter((timeframe) => {
    const candles = candlesByTimeframe[timeframe];
    const closes = candles.map((candle) => candle.close);
    const ema200 = ema(closes, 200).at(-1) ?? closes.at(-1) ?? 0;
    const price = latestClose(candles);
    return direction === "LONG" ? price > ema200 : price < ema200;
  }).length;
  return {
    module: "Multi-timeframe context",
    score: alignedCount === 2 ? 15 : alignedCount === 1 ? 8 : 2,
    reason: `${alignedCount}/2 context timeframes aligned`
  };
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

// Trail width (ATR multiples) chosen at entry from the regime: a strong aligned
// trend rides wide so winners run; chop, volatility, or a regime that fights the
// trade direction locks tight to protect gains.
function chooseTrailMultiple(config: AppConfig, regime: MarketRegime, confidence: number, aligned: boolean): number {
  if (regime === "VOLATILE" || regime === "SIDEWAYS" || !aligned) {
    return config.TRAIL_CHOP_ATR_MULT;
  }
  return confidence >= config.TRAIL_STRONG_CONFIDENCE ? config.TRAIL_STRONG_ATR_MULT : config.TRAIL_WEAK_ATR_MULT;
}

function setupQualityGate(config: AppConfig, hasLiquiditySweep: boolean, rawScore: number): ModuleScore {
  const cappedRawScore = clampScore(rawScore);
  const configuredCap = Number.isFinite(config.MAX_SCORE_WITHOUT_LIQUIDITY_SWEEP) ? config.MAX_SCORE_WITHOUT_LIQUIDITY_SWEEP : 74;
  const maxScoreWithoutSweep = Math.min(configuredCap, config.MIN_CONFIDENCE_SCORE - 1);
  const penalty = hasLiquiditySweep ? 0 : Math.min(0, maxScoreWithoutSweep - cappedRawScore);

  return {
    module: "Setup quality gate",
    score: penalty,
    reason: hasLiquiditySweep
      ? "liquidity sweep confirms entry trigger"
      : `liquidity sweep required before papertrade; score capped at ${maxScoreWithoutSweep}`
  };
}

function buildSignal(
  config: AppConfig,
  symbol: SupportedSymbol,
  candlesByTimeframe: CandleMap,
  timeframe: "5m" | "15m",
  direction: "LONG" | "SHORT"
): TradingSignal {
  const candles = candlesByTimeframe[timeframe];
  const entryPrice = latestClose(candles);
  const atrProxy = Math.max(entryPrice * 0.004, (candles.at(-1)?.high ?? entryPrice) - (candles.at(-1)?.low ?? entryPrice));
  const stopLoss = direction === "LONG" ? entryPrice - atrProxy : entryPrice + atrProxy;
  const takeProfit1 = direction === "LONG" ? entryPrice + atrProxy * 1.5 : entryPrice - atrProxy * 1.5;
  const takeProfit2 = direction === "LONG" ? entryPrice + atrProxy * 2.5 : entryPrice - atrProxy * 2.5;
  const markovRegime = assessMarkovRegime(candlesByTimeframe["1h"], candlesByTimeframe["4h"], direction, {
    enabled: config.MARKOV_REGIME_ENABLED,
    penalty: config.MARKOV_REGIME_PENALTY,
    volatilePenalty: config.MARKOV_REGIME_VOLATILE_PENALTY
  });
  const wick = wickScore(candles, direction);
  const preliminaryScores = [
    trendScore(candles, direction),
    rsiScore(candles, direction),
    macdScore(candles, direction),
    volumeScore(candles),
    wick,
    timeframeScore(candlesByTimeframe, direction),
    markovRegime.moduleScore
  ];
  const rawScore = preliminaryScores.reduce((sum, module) => sum + module.score, 0);
  const moduleScores = [...preliminaryScores, setupQualityGate(config, wick.score > 0, rawScore)];
  const score = clampScore(moduleScores.reduce((sum, module) => sum + module.score, 0));
  const reason = moduleScores.map((module) => module.reason).join("; ");

  return {
    symbol,
    timeframe,
    direction,
    score,
    reason,
    moduleScores,
    entryPrice: round(entryPrice),
    stopLoss: round(stopLoss),
    takeProfit1: round(takeProfit1),
    takeProfit2: round(takeProfit2),
    trailAtrMultiple: round(chooseTrailMultiple(config, markovRegime.regime, markovRegime.confidence, markovRegime.aligned), 3),
    entryRegime: markovRegime.regime
  };
}

export function generateSignals(config: AppConfig, symbol: SupportedSymbol, candlesByTimeframe: CandleMap): TradingSignal[] {
  const entryTimeframes = ["5m", "15m"] as const;
  return entryTimeframes.flatMap((timeframe) => [
    buildSignal(config, symbol, candlesByTimeframe, timeframe, "LONG"),
    buildSignal(config, symbol, candlesByTimeframe, timeframe, "SHORT")
  ]);
}
