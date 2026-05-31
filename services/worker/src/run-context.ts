import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { type AppConfig } from "@tradeplatformcodex/shared";
import { prisma } from "./db";

type ActiveRun = {
  id: string;
  name: string;
  configHash: string;
};

let activeRun: ActiveRun | null = null;

function buildRunSnapshot(config: AppConfig): Record<string, unknown> {
  return {
    APP_NAME: config.APP_NAME,
    NODE_ENV: config.NODE_ENV,
    TRADING_MODE: config.TRADING_MODE,
    ENABLE_LIVE_TRADING: config.ENABLE_LIVE_TRADING,
    EXCHANGE: config.EXCHANGE,
    SYMBOLS: config.SYMBOLS,
    TIMEFRAMES: config.TIMEFRAMES,
    ENTRY_TIMEFRAMES: config.ENTRY_TIMEFRAMES,
    CONTEXT_TIMEFRAMES: config.CONTEXT_TIMEFRAMES,
    EMA_FAST: config.EMA_FAST,
    EMA_SLOW: config.EMA_SLOW,
    EMA_CROSS_LOOKBACK: config.EMA_CROSS_LOOKBACK,
    START_BALANCE: config.START_BALANCE,
    MAX_RISK_PER_TRADE: config.MAX_RISK_PER_TRADE,
    MAX_DAILY_LOSS: config.MAX_DAILY_LOSS,
    MAX_OPEN_TRADES: config.MAX_OPEN_TRADES,
    MAX_OPEN_TRADES_PER_SYMBOL: config.MAX_OPEN_TRADES_PER_SYMBOL,
    MIN_CONFIDENCE_SCORE: config.MIN_CONFIDENCE_SCORE,
    MAX_SCORE_WITHOUT_LIQUIDITY_SWEEP: config.MAX_SCORE_WITHOUT_LIQUIDITY_SWEEP,
    MAX_TRADES_PER_DAY: config.MAX_TRADES_PER_DAY,
    WORKER_INTERVAL_SECONDS: config.WORKER_INTERVAL_SECONDS,
    ADX_TREND_BONUS: config.ADX_TREND_BONUS,
    MARKOV_REGIME_ENABLED: config.MARKOV_REGIME_ENABLED,
    MARKOV_REGIME_PENALTY: config.MARKOV_REGIME_PENALTY,
    MARKOV_REGIME_VOLATILE_PENALTY: config.MARKOV_REGIME_VOLATILE_PENALTY,
    MARKOV_CONTEXT_TIMEFRAMES: config.MARKOV_CONTEXT_TIMEFRAMES,
    MARKOV_VOLATILE_THRESHOLD: config.MARKOV_VOLATILE_THRESHOLD,
    MARKOV_SIDEWAYS_THRESHOLD: config.MARKOV_SIDEWAYS_THRESHOLD,
    KELTNER_PERIOD: config.KELTNER_PERIOD,
    KELTNER_ATR_MULT: config.KELTNER_ATR_MULT,
    EXTENSION_ATR_MULT: config.EXTENSION_ATR_MULT,
    EXTENSION_PENALTY: config.EXTENSION_PENALTY,
    SQUEEZE_ENABLED: config.SQUEEZE_ENABLED,
    SQUEEZE_BB_K: config.SQUEEZE_BB_K,
    SQUEEZE_BONUS: config.SQUEEZE_BONUS,
    VWAP_ENABLED: config.VWAP_ENABLED,
    VWAP_BONUS: config.VWAP_BONUS,
    FLASH_WICK_ATR_MULT: config.FLASH_WICK_ATR_MULT,
    FLASH_WICK_BODY_RATIO: config.FLASH_WICK_BODY_RATIO,
    FLASH_WICK_PENALTY: config.FLASH_WICK_PENALTY,
    GOLDEN_SCORE: config.GOLDEN_SCORE,
    SWING_STRUCTURE_ENABLED: config.SWING_STRUCTURE_ENABLED,
    SWING_POINT_LOOKBACK: config.SWING_POINT_LOOKBACK,
    SWING_STOP_BUFFER_ATR: config.SWING_STOP_BUFFER_ATR,
    SWING_STOP_MAX_ATR: config.SWING_STOP_MAX_ATR,
    DAILY_REPORT_ENABLED: config.DAILY_REPORT_ENABLED,
    BOT_ENABLED: config.BOT_ENABLED,
    KILL_SWITCH: config.KILL_SWITCH
  };
}

function hashSnapshot(snapshot: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

export function getActiveRunId(): string | null {
  return activeRun?.id ?? null;
}

export async function ensureActiveRun(config: AppConfig): Promise<ActiveRun> {
  const configSnapshot = buildRunSnapshot(config);
  const configHash = hashSnapshot(configSnapshot);
  const name = `${config.APP_NAME} ${configHash.slice(0, 8)}`;

  const run = await prisma.botRun.upsert({
    where: { configHash },
    create: {
      name,
      configHash,
      configSnapshot: configSnapshot as Prisma.InputJsonValue,
      status: "RUNNING"
    },
    update: {
      name,
      configSnapshot: configSnapshot as Prisma.InputJsonValue,
      status: "RUNNING",
      lastSeenAt: new Date()
    }
  });

  activeRun = {
    id: run.id,
    name: run.name,
    configHash: run.configHash
  };

  return activeRun;
}

export async function touchActiveRun(): Promise<void> {
  if (!activeRun) {
    return;
  }

  await prisma.botRun.update({
    where: { id: activeRun.id },
    data: {
      status: "RUNNING",
      lastSeenAt: new Date()
    }
  });
}
