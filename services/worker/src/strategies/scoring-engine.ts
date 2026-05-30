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
import { adx, ema, hasBearishShakeout, hasBullishShakeout, macd, obv } from "./indicators";
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

function macdScore(candles: Candle[], direction: "LONG" | "SHORT"): ModuleScore {
  const result = macd(candles.map((candle) => candle.close));
  const aligned = direction === "LONG" ? result.histogram > 0 : result.histogram < 0;
  return {
    module: "MACD momentum",
    score: aligned ? 20 : 5,
    reason: aligned ? "MACD histogram confirms momentum" : "MACD momentum missing"
  };
}

// Volume confirmation via OBV: rather than only checking that volume was large,
// check that cumulative volume pressure is flowing WITH the trade direction
// (above its baseline and still building). Direction-aware beats magnitude-only.
function volumeScore(config: AppConfig, candles: Candle[], direction: "LONG" | "SHORT"): ModuleScore {
  const series = obv(candles);
  const latest = series.at(-1) ?? 0;
  const baseline = average(series.slice(-config.OBV_SMA_LENGTH));
  const prior = series.at(-1 - config.OBV_MOMENTUM_LENGTH) ?? latest;
  const rising = latest > prior;
  const falling = latest < prior;
  const aligned = direction === "LONG" ? latest > baseline && rising : latest < baseline && falling;
  const opposes = direction === "LONG" ? latest < baseline && falling : latest > baseline && rising;
  const score = aligned ? 20 : opposes ? 4 : 11;
  return {
    module: "Volume confirmation (OBV)",
    score,
    reason: aligned
      ? `OBV pressure flows with ${direction}`
      : opposes
        ? "OBV pressure opposes the trade"
        : "OBV pressure neutral"
  };
}

// ADX trend-strength gate. EMA200 says which way; this says whether the trend is
// strong enough to ride. Below threshold = chop (penalised). Strong but with the
// directional indicators fighting the trade is also penalised; strong and
// aligned passes clean (neutral, the other modules carry the score).
function adxScore(config: AppConfig, candles: Candle[], direction: "LONG" | "SHORT"): ModuleScore {
  const { adx: adxValue, plusDI, minusDI } = adx(candles);
  const strong = adxValue >= config.ADX_TREND_THRESHOLD;
  const diAligned = direction === "LONG" ? plusDI > minusDI : minusDI > plusDI;
  if (strong && diAligned) {
    return {
      module: "ADX trend strength",
      score: 0,
      reason: `ADX ${round(adxValue, 1)} confirms a strong ${direction} trend`
    };
  }
  if (!strong) {
    return {
      module: "ADX trend strength",
      score: -config.ADX_CHOP_PENALTY,
      reason: `ADX ${round(adxValue, 1)} below ${config.ADX_TREND_THRESHOLD}: choppy, no tradable trend`
    };
  }
  return {
    module: "ADX trend strength",
    score: -config.ADX_CHOP_PENALTY,
    reason: `ADX ${round(adxValue, 1)} strong but directional indicators oppose ${direction}`
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
    score: alignedCount === 2 ? 20 : alignedCount === 1 ? 11 : 3,
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
    adxScore(config, candles, direction),
    macdScore(candles, direction),
    volumeScore(config, candles, direction),
    wick,
    timeframeScore(candlesByTimeframe, direction),
    markovRegime.moduleScore
  ];
  const moduleScores = preliminaryScores;
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
