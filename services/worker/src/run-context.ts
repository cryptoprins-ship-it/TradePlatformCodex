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
    START_BALANCE: config.START_BALANCE,
    MAX_RISK_PER_TRADE: config.MAX_RISK_PER_TRADE,
    MAX_DAILY_LOSS: config.MAX_DAILY_LOSS,
    MAX_OPEN_TRADES: config.MAX_OPEN_TRADES,
    MIN_CONFIDENCE_SCORE: config.MIN_CONFIDENCE_SCORE,
    MAX_SCORE_WITHOUT_LIQUIDITY_SWEEP: config.MAX_SCORE_WITHOUT_LIQUIDITY_SWEEP,
    MAX_TRADES_PER_DAY: config.MAX_TRADES_PER_DAY,
    WORKER_INTERVAL_SECONDS: config.WORKER_INTERVAL_SECONDS,
    MARKOV_REGIME_ENABLED: config.MARKOV_REGIME_ENABLED,
    MARKOV_REGIME_PENALTY: config.MARKOV_REGIME_PENALTY,
    MARKOV_REGIME_VOLATILE_PENALTY: config.MARKOV_REGIME_VOLATILE_PENALTY,
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
