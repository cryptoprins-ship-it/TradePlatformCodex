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
import {
  adx,
  anchoredVwap,
  atr,
  ema,
  findSwingHigh,
  findSwingLow,
  hasBearishShakeout,
  hasBullishShakeout,
  isFlashWick,
  isInSqueeze,
  macd,
  obv,
  recentEmaCross
} from "./indicators";
import { assessMarkovRegime, type MarketRegime } from "./markov-regime";

type CandleMap = Record<Timeframe, Candle[]>;

function latestClose(candles: Candle[]): number {
  return candles.at(-1)?.close ?? 0;
}

// Trend trigger on a configurable fast/slow EMA pair (scalp 8/50, swing 50/200).
// A FRESH cross in the trade direction (fast crossing slow within
// EMA_CROSS_LOOKBACK bars) is the strongest read; an established stack still
// scores, but lower; no alignment is penalised.
function trendScore(config: AppConfig, candles: Candle[], direction: "LONG" | "SHORT"): ModuleScore {
  const closes = candles.map((candle) => candle.close);
  const fast = ema(closes, config.EMA_FAST).at(-1) ?? closes.at(-1) ?? 0;
  const slow = ema(closes, config.EMA_SLOW).at(-1) ?? closes.at(-1) ?? 0;
  const price = latestClose(candles);
  const stacked = direction === "LONG" ? fast > slow && price > slow : fast < slow && price < slow;
  const cross = recentEmaCross(closes, config.EMA_FAST, config.EMA_SLOW, config.EMA_CROSS_LOOKBACK);
  const freshCross = direction === "LONG" ? cross === "BULLISH" : cross === "BEARISH";
  const pair = `EMA${config.EMA_FAST}/${config.EMA_SLOW}`;
  if (freshCross) {
    return { module: "EMA cross", score: 20, reason: `${pair} fresh ${direction.toLowerCase()} cross` };
  }
  if (stacked) {
    return { module: "EMA cross", score: 12, reason: `${pair} stacked ${direction.toLowerCase()}, no fresh cross` };
  }
  return { module: "EMA cross", score: 5, reason: `${pair} not aligned for ${direction.toLowerCase()}` };
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
      score: config.ADX_TREND_BONUS,
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

// Higher-timeframe trend agreement on the configured context timeframes. Scalp
// checks 1h/4h; swing adds 1d so a macro trend must agree. Score scales with the
// aligned fraction (none -> 3, all -> 20) so adding the daily does not distort it.
function timeframeScore(config: AppConfig, candlesByTimeframe: CandleMap, direction: "LONG" | "SHORT"): ModuleScore {
  const context = (config.CONTEXT_TIMEFRAMES as Timeframe[]).filter(
    (timeframe) => candlesByTimeframe[timeframe]?.length
  );
  const total = context.length || 1;
  const alignedCount = context.filter((timeframe) => {
    const candles = candlesByTimeframe[timeframe];
    const closes = candles.map((candle) => candle.close);
    // Macro filter uses the strategy's own slow EMA, not a fixed 200: EMA200 is
    // meaningless on a scalp's fast context (EMA50), so scalp checks 50 and swing
    // checks 200.
    const emaSlow = ema(closes, config.EMA_SLOW).at(-1) ?? closes.at(-1) ?? 0;
    const price = latestClose(candles);
    return direction === "LONG" ? price > emaSlow : price < emaSlow;
  }).length;
  return {
    module: "Multi-timeframe context",
    score: Math.round(3 + (alignedCount / total) * 17),
    reason: `${alignedCount}/${context.length} context timeframes aligned`
  };
}

// VWAP confluence (scalp): price relative to the session VWAP, confirmed by the
// fast EMA. Both price and EMA8 on the trade's side of VWAP = the intraday value
// area backs the move (full bonus); price alone = half. Off by default; swing
// leaves it disabled since VWAP resets each session and means little across days.
function vwapScore(config: AppConfig, candles: Candle[], direction: "LONG" | "SHORT"): ModuleScore {
  if (!config.VWAP_ENABLED) {
    return { module: "VWAP confluence", score: 0, reason: "VWAP disabled" };
  }
  const vwap = anchoredVwap(candles);
  if (vwap === null) {
    return { module: "VWAP confluence", score: 0, reason: "no VWAP (no session volume)" };
  }
  const price = latestClose(candles);
  const fast = ema(candles.map((candle) => candle.close), config.EMA_FAST).at(-1) ?? price;
  const priceAligned = direction === "LONG" ? price > vwap : price < vwap;
  const emaAligned = direction === "LONG" ? fast > vwap : fast < vwap;
  const score = priceAligned && emaAligned ? config.VWAP_BONUS : priceAligned ? Math.round(config.VWAP_BONUS / 2) : 0;
  return {
    module: "VWAP confluence",
    score,
    reason:
      priceAligned && emaAligned
        ? `price + EMA${config.EMA_FAST} above/below VWAP with ${direction}`
        : priceAligned
          ? `price on ${direction} side of VWAP, EMA${config.EMA_FAST} not yet`
          : `price on wrong side of VWAP for ${direction}`
  };
}

// Flash-wick breaker: a hard volatility filter. When the entry candle is an
// abnormal liquidation wick the setup is heavily penalised so its score drops
// below the confidence threshold and no trade opens.
function flashWickScore(config: AppConfig, candles: Candle[]): ModuleScore {
  const flash = isFlashWick(candles, config.FLASH_WICK_ATR_MULT, config.FLASH_WICK_BODY_RATIO);
  return {
    module: "Flash-wick breaker",
    score: flash ? -config.FLASH_WICK_PENALTY : 0,
    reason: flash
      ? `flash wick: bar range > ${config.FLASH_WICK_ATR_MULT}x ATR with small body; entry blocked`
      : "no flash-wick volatility"
  };
}

// Extension gate: distance of price from the Keltner mean in ATR units. An entry
// already stretched EXTENSION_ATR_MULT * ATR in the trade direction is chasing an
// extended move (buying the top / selling the bottom) and gets penalised.
function extensionScore(config: AppConfig, candles: Candle[], direction: "LONG" | "SHORT"): ModuleScore {
  const closes = candles.map((candle) => candle.close);
  const mean = ema(closes, config.KELTNER_PERIOD).at(-1) ?? latestClose(candles);
  const range = atr(candles, config.KELTNER_PERIOD);
  if (range <= 0) {
    return { module: "Extension gate", score: 0, reason: "no volatility reading for extension" };
  }
  const extension = (latestClose(candles) - mean) / range;
  const stretched =
    direction === "LONG" ? extension > config.EXTENSION_ATR_MULT : extension < -config.EXTENSION_ATR_MULT;
  return {
    module: "Extension gate",
    score: stretched ? -config.EXTENSION_PENALTY : 0,
    reason: stretched
      ? `price ${round(Math.abs(extension), 1)}x ATR beyond mean; overextended ${direction.toLowerCase()}, fade risk`
      : "entry not overextended"
  };
}

// Squeeze breakout: reward a setup firing out of a volatility squeeze (Bollinger
// compressed inside the Keltner Channel) when the prior bar was squeezed, the
// latest has released, and price is on the trade's side of the mean.
function squeezeScore(config: AppConfig, candles: Candle[], direction: "LONG" | "SHORT"): ModuleScore {
  if (!config.SQUEEZE_ENABLED) {
    return { module: "Squeeze breakout", score: 0, reason: "squeeze detector disabled" };
  }
  const inSqueeze = isInSqueeze(candles, config.KELTNER_PERIOD, config.SQUEEZE_BB_K, config.KELTNER_ATR_MULT);
  const wasSqueezed = isInSqueeze(candles.slice(0, -1), config.KELTNER_PERIOD, config.SQUEEZE_BB_K, config.KELTNER_ATR_MULT);
  const releasing = wasSqueezed && !inSqueeze;
  const mean = ema(candles.map((candle) => candle.close), config.KELTNER_PERIOD).at(-1) ?? latestClose(candles);
  const momentumAligned = direction === "LONG" ? latestClose(candles) > mean : latestClose(candles) < mean;
  const fire = releasing && momentumAligned;
  return {
    module: "Squeeze breakout",
    score: fire ? config.SQUEEZE_BONUS : 0,
    reason: fire
      ? "firing out of a volatility squeeze"
      : inSqueeze
        ? "in squeeze (compression), no breakout yet"
        : "no squeeze setup"
  };
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

// Structure-aware stop: anchor the stop just beyond the most recent swing low
// (LONG) / swing high (SHORT) plus an ATR buffer. Falls back to the flat ATR
// proxy when structure is disabled, absent, on the wrong side of entry, or so far
// that the implied risk exceeds SWING_STOP_MAX_ATR (an unreliable anchor).
function chooseStop(
  config: AppConfig,
  candles: Candle[],
  direction: "LONG" | "SHORT",
  entryPrice: number,
  atrProxy: number
): { stopLoss: number; riskDistance: number } {
  const flat = {
    stopLoss: direction === "LONG" ? entryPrice - atrProxy : entryPrice + atrProxy,
    riskDistance: atrProxy
  };
  if (!config.SWING_STRUCTURE_ENABLED) {
    return flat;
  }
  const swing =
    direction === "LONG"
      ? findSwingLow(candles, config.SWING_POINT_LOOKBACK)
      : findSwingHigh(candles, config.SWING_POINT_LOOKBACK);
  if (swing === null) {
    return flat;
  }
  const onCorrectSide = direction === "LONG" ? swing < entryPrice : swing > entryPrice;
  if (!onCorrectSide) {
    return flat;
  }
  const buffer = atrProxy * config.SWING_STOP_BUFFER_ATR;
  const stopLoss = direction === "LONG" ? swing - buffer : swing + buffer;
  const riskDistance = Math.abs(entryPrice - stopLoss);
  if (riskDistance > atrProxy * config.SWING_STOP_MAX_ATR) {
    return flat;
  }
  return { stopLoss, riskDistance };
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
  timeframe: Timeframe,
  direction: "LONG" | "SHORT"
): TradingSignal {
  const candles = candlesByTimeframe[timeframe];
  const entryPrice = latestClose(candles);
  const atrProxy = Math.max(entryPrice * 0.004, (candles.at(-1)?.high ?? entryPrice) - (candles.at(-1)?.low ?? entryPrice));
  const { stopLoss, riskDistance } = chooseStop(config, candles, direction, entryPrice, atrProxy);
  // Take-profits keep fixed R multiples off the chosen risk distance, so a wider
  // structural stop scales the targets with it (R:R stays constant).
  const takeProfit1 = direction === "LONG" ? entryPrice + riskDistance * 1.5 : entryPrice - riskDistance * 1.5;
  const takeProfit2 = direction === "LONG" ? entryPrice + riskDistance * 2.5 : entryPrice - riskDistance * 2.5;
  const [regimeContext, regimeHigherContext] = config.MARKOV_CONTEXT_TIMEFRAMES as Timeframe[];
  const markovRegime = assessMarkovRegime(
    candlesByTimeframe[regimeContext] ?? candles,
    candlesByTimeframe[regimeHigherContext ?? regimeContext] ?? candlesByTimeframe[regimeContext] ?? candles,
    direction,
    {
      enabled: config.MARKOV_REGIME_ENABLED,
      penalty: config.MARKOV_REGIME_PENALTY,
      volatilePenalty: config.MARKOV_REGIME_VOLATILE_PENALTY,
      volatileThreshold: config.MARKOV_VOLATILE_THRESHOLD,
      sidewaysThreshold: config.MARKOV_SIDEWAYS_THRESHOLD
    }
  );
  const wick = wickScore(candles, direction);
  const preliminaryScores = [
    trendScore(config, candles, direction),
    adxScore(config, candles, direction),
    macdScore(candles, direction),
    volumeScore(config, candles, direction),
    wick,
    timeframeScore(config, candlesByTimeframe, direction),
    flashWickScore(config, candles),
    extensionScore(config, candles, direction),
    squeezeScore(config, candles, direction),
    vwapScore(config, candles, direction),
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
  const entryTimeframes = config.ENTRY_TIMEFRAMES as Timeframe[];
  return entryTimeframes
    .filter((timeframe) => candlesByTimeframe[timeframe]?.length)
    .flatMap((timeframe) => [
      buildSignal(config, symbol, candlesByTimeframe, timeframe, "LONG"),
      buildSignal(config, symbol, candlesByTimeframe, timeframe, "SHORT")
    ]);
}
