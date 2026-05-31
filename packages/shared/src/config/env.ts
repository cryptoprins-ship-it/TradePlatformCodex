import { z } from "zod";
import type { SupportedSymbol } from "../types/trading";

export const SUPPORTED_SYMBOLS: SupportedSymbol[] = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "WLDUSDT"];

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
  START_BALANCE: numberString(1000),
  MAX_RISK_PER_TRADE: numberString(1),
  MAX_DAILY_LOSS: numberString(3),
  MAX_OPEN_TRADES: numberString(5),
  // Open trades allowed per symbol, so one coin can't hog the book.
  MAX_OPEN_TRADES_PER_SYMBOL: numberString(2),
  MIN_CONFIDENCE_SCORE: numberString(75),
  MAX_SCORE_WITHOUT_LIQUIDITY_SWEEP: numberString(74),
  MAX_TRADES_PER_DAY: numberString(3),
  WORKER_INTERVAL_SECONDS: numberString(60),
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
  // ADX trend-strength gate: below the threshold price is chopping and
  // trend-following entries whipsaw, so the setup is penalised. Strong ADX with
  // matching directional indicators passes clean.
  ADX_TREND_THRESHOLD: numberString(20),
  ADX_CHOP_PENALTY: numberString(15),
  // OBV (volume-direction) confirmation: is buying/selling pressure flowing with
  // the trade? SMA length sets the trend baseline, momentum length the lookback
  // for rising/falling.
  OBV_SMA_LENGTH: numberString(55),
  OBV_MOMENTUM_LENGTH: numberString(3),
  MARKOV_REGIME_ENABLED: booleanString.default("true"),
  MARKOV_REGIME_PENALTY: numberString(25),
  MARKOV_REGIME_VOLATILE_PENALTY: numberString(35),
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
