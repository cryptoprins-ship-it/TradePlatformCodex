import { loadConfig, type Timeframe, type TradingSignal } from "@tradeplatformcodex/shared";
import { sendTelegram, formatSignalAlert } from "./alerts/telegram";
import { ensureBtcSymbol, storeCandles } from "./market-data/candle-store";
import { MEXCMarketDataClient } from "./market-data/mexc-client";
import { openPaperTrade, monitorOpenPaperTrades } from "./papertrading/papertrading-engine";
import { prisma } from "./db";
import { logBot } from "./logging/bot-log";
import { generateSignals } from "./strategies/scoring-engine";

const config = loadConfig();
const client = new MEXCMarketDataClient();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function persistSignal(signal: TradingSignal): Promise<string> {
  const created = await prisma.signal.create({
    data: {
      symbol: signal.symbol,
      timeframe: signal.timeframe,
      direction: signal.direction,
      score: signal.score,
      reason: signal.reason,
      strategyScores: {
        create: signal.moduleScores.map((module) => ({
          module: module.module,
          score: module.score,
          reason: module.reason
        }))
      }
    }
  });
  return created.id;
}

export async function runWorkerCycle(): Promise<void> {
  await ensureBtcSymbol();
  if (config.KILL_SWITCH) {
    await logBot("warn", "KILL_SWITCH active: new trades blocked");
    await sendTelegram(config, "KILL_SWITCH active: new trades blocked");
  }

  const candlesByTimeframe = Object.fromEntries(
    await Promise.all(
      (config.TIMEFRAMES as Timeframe[]).map(async (timeframe) => {
        const candles = await client.getCandles("BTCUSDT", timeframe);
        await storeCandles(candles);
        return [timeframe, candles] as const;
      })
    )
  ) as Record<Timeframe, Awaited<ReturnType<MEXCMarketDataClient["getCandles"]>>>;

  const currentPrice = await client.getTickerPrice("BTCUSDT");
  await monitorOpenPaperTrades(currentPrice);

  const signals = generateSignals(config, candlesByTimeframe);
  for (const signal of signals) {
    const signalId = await persistSignal(signal);
    await sendTelegram(config, formatSignalAlert(signal));
    await openPaperTrade(config, { ...signal, signalId });
  }

  await logBot("info", "Worker cycle completed", {
    symbol: "BTCUSDT",
    signals: signals.length
  });
}

async function runWorkerLoop(): Promise<void> {
  await logBot("info", "Worker loop started", {
    symbol: "BTCUSDT",
    intervalSeconds: config.WORKER_INTERVAL_SECONDS
  });

  while (true) {
    try {
      await runWorkerCycle();
    } catch (error: unknown) {
      await logBot("error", "Worker cycle failed", {
        error: error instanceof Error ? error.message : "unknown error"
      });
    }

    await sleep(config.WORKER_INTERVAL_SECONDS * 1000);
  }
}

runWorkerLoop().catch(async (error: unknown) => {
  await logBot("error", "Worker loop crashed", { error: error instanceof Error ? error.message : "unknown error" });
  await prisma.$disconnect();
  process.exitCode = 1;
});
