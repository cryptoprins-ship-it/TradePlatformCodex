import { z } from "zod";
import type { SupportedSymbol } from "../types/trading";

// Sector basket: two representatives per crypto sector — the market-cap leader
// plus a higher-expectation pick — as USDT spot pairs on MEXC. NOTE: the gold,
// oracle, L2, DePIN, staking, modular, DEX, storage and TON pairs were added at
// the user's request and are NOT live-verified here — confirm each pair trades
// on MEXC in your deployment, as the candle/ticker fetch errors for any symbol
// MEXC does not list.
export const SUPPORTED_SYMBOLS: SupportedSymbol[] = [
  "BTCUSDT", // L1 major / digital gold
  "ETHUSDT", // smart-contract L1
  "SOLUSDT", // high-perf L1
  "XRPUSDT", // payments
  "BNBUSDT", // exchange token
  "DOGEUSDT", // meme
  "PENGUUSDT", // NFT / consumer
  "ZECUSDT", // privacy
  "WLDUSDT", // identity
  "TAOUSDT", // AI
  "FETUSDT", // AI
  "ONDOUSDT", // RWA
  "AAVEUSDT", // DeFi
  "INJUSDT", // interop / infra
  "AXSUSDT", // gaming
  "BERAUSDT", // new L1
  "ENSOUSDT", // intent / DeFi infra
  "PAXGUSDT", // gold (Pax Gold)
  "XAUTUSDT", // gold (Tether Gold)
  "LINKUSDT", // oracle (mcap leader)
  "PYTHUSDT", // oracle (high expectation)
  "ARBUSDT", // layer-2 (mcap leader)
  "OPUSDT", // layer-2 (high expectation)
  "RENDERUSDT", // DePIN (mcap leader)
  "AKTUSDT", // DePIN (high expectation)
  "LDOUSDT", // liquid staking (mcap leader)
  "EIGENUSDT", // restaking (high expectation)
  "TIAUSDT", // modular / DA (mcap leader)
  "DYMUSDT", // modular / DA (high expectation)
  "UNIUSDT", // DEX (mcap leader)
  "JUPUSDT", // DEX (high expectation)
  "FILUSDT", // storage (mcap leader)
  "ARUSDT", // storage (high expectation)
  "TONUSDT", // TON / messaging (mcap leader)
  "NOTUSDT", // TON ecosystem (high expectation)
  // Beaten-down high-potential plays (far below ATH, narrative still alive):
  "ICPUSDT", // compute / AI
  "NEARUSDT", // L1 / AI
  "DOTUSDT", // L0 / interop
  "AVAXUSDT", // L1
  "ATOMUSDT", // interop
  "GRTUSDT", // data / indexing
  "STXUSDT", // BTC L2
  "IMXUSDT", // gaming L2
  "POLUSDT", // L2 / agglayer
  "ROSEUSDT", // privacy / AI
  "ENAUSDT", // synthetic dollar
  "PENDLEUSDT", // yield / DeFi
  "HBARUSDT", // L1 (enterprise / RWA)
  "THETAUSDT", // media (video network)
  "AUDIOUSDT", // media (music)
  "HYPEUSDT", // derivatives / perps DEX
  "SNXUSDT", // derivatives (synthetics)
  "DYDXUSDT", // derivatives (perps)
  "RUNEUSDT", // cross-chain liquidity
  "AXLUSDT", // cross-chain / bridge
  "MKRUSDT", // stablecoin / CDP (Maker)
  "SKYUSDT", // stablecoin / CDP (Sky)
  "ENSUSDT", // identity (naming)
  "BLURUSDT", // NFT (marketplace)
  "SANDUSDT", // gaming (metaverse)
  "GALAUSDT", // gaming
  "SHIBUSDT", // meme
  "PEPEUSDT", // meme
  "WIFUSDT" // meme (Solana)
];

const booleanString = z
  .string()
  .default("false")
  .transform((value) => value.toLowerCase() === "true");

const numberString = (defaultValue: number) =>
  z
    .string()
    .default(String(defaultValue))
    .transform((value, ctx) => {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Expected numeric value" });
        return z.NEVER;
      }
      return parsed;
    });

const envSchema = z.object({
  APP_NAME: z.string().default("TradePlatformCodex"),
  NODE_ENV: z.string().default("development"),
  TRADING_MODE: z.literal("paper").default("paper"),
  ENABLE_LIVE_TRADING: booleanString.refine((value) => value === false, {
    message: "Live trading is disabled in phase 1A"
  }),
  EXCHANGE: z.literal("MEXC").default("MEXC"),
  SYMBOLS: z
    .string()
    .default("BTCUSDT")
    .transform((value) => value.split(",").map((symbol) => symbol.trim()).filter(Boolean))
    .refine((symbols): symbols is SupportedSymbol[] => symbols.length > 0 && symbols.every((symbol) => SUPPORTED_SYMBOLS.includes(symbol as SupportedSymbol)), {
      message: `Supported symbols: ${SUPPORTED_SYMBOLS.join(",")}`
    }),
  TIMEFRAMES: z
    .string()
    .default("5m,15m,1h,4h")
    .transform((value) => value.split(",").map((timeframe) => timeframe.trim()).filter(Boolean)),
  // The timeframes the strategy actually enters on (subset of TIMEFRAMES, which
  // are all fetched). Scalp enters on 5m/15m, swing on 1h/4h.
  ENTRY_TIMEFRAMES: z
    .string()
    .default("5m,15m")
    .transform((value) => value.split(",").map((timeframe) => timeframe.trim()).filter(Boolean)),
  // Higher-timeframe context the multi-timeframe module scores against (subset of
  // TIMEFRAMES, all fetched). Scalp checks 1h/4h; swing adds the daily (1d) so a
  // macro trend has to agree. MEXC spot klines have no native 12h, so the daily
  // is the higher swing context.
  CONTEXT_TIMEFRAMES: z
    .string()
    .default("1h,4h")
    .transform((value) => value.split(",").map((timeframe) => timeframe.trim()).filter(Boolean)),
  START_BALANCE: numberString(1000),
  MAX_RISK_PER_TRADE: numberString(1),
  MAX_DAILY_LOSS: numberString(3),
  MAX_OPEN_TRADES: numberString(5),
  // Open trades allowed per symbol, so one coin can't hog the book.
  MAX_OPEN_TRADES_PER_SYMBOL: numberString(2),
  MIN_CONFIDENCE_SCORE: numberString(70),
  MAX_SCORE_WITHOUT_LIQUIDITY_SWEEP: numberString(74),
  MAX_TRADES_PER_DAY: numberString(3),
  WORKER_INTERVAL_SECONDS: numberString(60),
  // How often open trades are monitored for exits (a cheap ticker-only pass)
  // BETWEEN full signal cycles. Scalp sets this low (e.g. 15s) so 5m stops/targets
  // aren't checked on minute-old prices, without re-fetching candles each time.
  // >= WORKER_INTERVAL_SECONDS disables the fast pass (one combined cycle).
  MONITOR_INTERVAL_SECONDS: numberString(60),
  // Modeled adverse slippage (basis points) applied to stop-loss fills, which
  // behave like market orders. Bounds the recorded loss to the stop level plus
  // this buffer instead of wherever the coarse poll happens to catch price.
  SLIPPAGE_BPS: numberString(5),
  // Regime-adaptive trailing stop after TP1: ATR multiples picked at entry from
  // the Markov regime. Strong aligned trend rides wide; chop/volatile locks tight.
  TRAIL_STRONG_ATR_MULT: numberString(2.5),
  TRAIL_WEAK_ATR_MULT: numberString(1.8),
  TRAIL_CHOP_ATR_MULT: numberString(1),
  TRAIL_STRONG_CONFIDENCE: numberString(0.6),
  // Trend filter EMA pair. Scalp rides a fast pair (8/50), swing a slow macro
  // pair (50/200): aligned when fast/slow stack the trade's way and price is on
  // the right side of the slow EMA.
  EMA_FAST: numberString(8),
  EMA_SLOW: numberString(50),
  // Bars within which a fast/slow EMA cross still counts as "fresh" (a momentum
  // trigger) rather than an established stack.
  EMA_CROSS_LOOKBACK: numberString(3),
  // ADX trend-strength gate: below the threshold price is chopping and
  // trend-following entries whipsaw, so the setup is penalised. Strong ADX with
  // matching directional indicators passes clean.
  ADX_TREND_THRESHOLD: numberString(20),
  ADX_CHOP_PENALTY: numberString(15),
  // Points a strong, directionally-aligned trend ADDS to the score (not just a
  // chop penalty). Trend strength now contributes positively; weak or opposing
  // ADX still subtracts ADX_CHOP_PENALTY.
  ADX_TREND_BONUS: numberString(15),
  // OBV (volume-direction) confirmation: is buying/selling pressure flowing with
  // the trade? SMA length sets the trend baseline, momentum length the lookback
  // for rising/falling.
  OBV_SMA_LENGTH: numberString(55),
  OBV_MOMENTUM_LENGTH: numberString(3),
  // Flash-wick breaker: block entries on the bar after an abnormal volatility
  // spike (a candle whose range exceeds ATR_MULT * ATR while its body is a small
  // fraction of that range — a liquidation wick). Such bars get wicked out, so
  // the breaker applies a heavy penalty that drops the setup below threshold.
  FLASH_WICK_ATR_MULT: numberString(3),
  FLASH_WICK_BODY_RATIO: numberString(0.35),
  FLASH_WICK_PENALTY: numberString(40),
  // Golden-setup eviction: when the open-trade caps (total or per-symbol) are full
  // and a setup scores at or above this, the weakest open trade in the binding
  // pool is closed to free a slot — but only if the newcomer outscores it.
  GOLDEN_SCORE: numberString(90),
  // Structure-aware stops: place the stop just beyond the most recent swing low
  // (LONG) / swing high (SHORT) plus a small ATR buffer, instead of a flat ATR
  // distance. LOOKBACK is the bars each side of a pivot; BUFFER_ATR pads past the
  // level; MAX_ATR caps how far a structural stop may sit before falling back to
  // the ATR proxy (a far structure is unreliable). Take-profits keep the same R
  // multiples off whichever risk distance is used.
  SWING_STRUCTURE_ENABLED: booleanString.default("true"),
  SWING_POINT_LOOKBACK: numberString(5),
  SWING_STOP_BUFFER_ATR: numberString(0.25),
  SWING_STOP_MAX_ATR: numberString(4),
  // Keltner-based volatility modules. KELTNER_PERIOD is the shared EMA/Bollinger/
  // ATR lookback. Extension gate: penalise entries already stretched
  // EXTENSION_ATR_MULT * ATR beyond the mean in the trade direction (don't chase
  // the top). Squeeze detector: when Bollinger compresses inside the Keltner
  // Channel (width KELTNER_ATR_MULT) and releases with momentum, add SQUEEZE_BONUS.
  KELTNER_PERIOD: numberString(20),
  KELTNER_ATR_MULT: numberString(1.5),
  EXTENSION_ATR_MULT: numberString(2.5),
  EXTENSION_PENALTY: numberString(15),
  SQUEEZE_ENABLED: booleanString.default("true"),
  SQUEEZE_BB_K: numberString(2),
  SQUEEZE_BONUS: numberString(15),
  // VWAP confluence (scalp only). Off by default; swing leaves it disabled since
  // the session VWAP resets each UTC day and is meaningless across multi-day swings.
  VWAP_ENABLED: booleanString.default("false"),
  VWAP_BONUS: numberString(15),
  // Daily report: once per local day, each worker posts its strategy's previous-day
  // summary (trades, winrate, P/L %, P/L money, profit factor, avg R) to Telegram.
  DAILY_REPORT_ENABLED: booleanString.default("true"),
  // Per-signal Telegram alerts. Off by default — with a multi-symbol basket they
  // flood the channel every cycle. The daily report is the intended summary.
  TELEGRAM_SIGNAL_ALERTS: booleanString.default("false"),
  MARKOV_REGIME_ENABLED: booleanString.default("true"),
  MARKOV_REGIME_PENALTY: numberString(25),
  MARKOV_REGIME_VOLATILE_PENALTY: numberString(35),
  // The two timeframes (context, higher context) the Markov regime model reads.
  // Scalp reads the regime fast (15m,1h); swing reads it slow (4h,1d). Reading a
  // scalp signal's regime off 1h/4h is too slow, so this is per-strategy.
  MARKOV_CONTEXT_TIMEFRAMES: z
    .string()
    .default("1h,4h")
    .transform((value) => value.split(",").map((timeframe) => timeframe.trim()).filter(Boolean)),
  // Regime classification cutoffs (per-bar log-return scale). Faster timeframes
  // carry more per-bar volatility, so scalp uses larger cutoffs or every bar reads
  // as VOLATILE; swing uses smaller ones on its smoother bars.
  MARKOV_VOLATILE_THRESHOLD: numberString(0.0075),
  MARKOV_SIDEWAYS_THRESHOLD: numberString(0.00045),
  BOT_ENABLED: booleanString.default("true"),
  KILL_SWITCH: booleanString,
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().default("redis://redis:6379"),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional()
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return envSchema.parse(env);
}
