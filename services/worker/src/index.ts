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

  const signals = generateSignals(candlesByTimeframe);
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

runWorkerCycle()
  .catch(async (error: unknown) => {
    await logBot("error", "Worker cycle failed", { error: error instanceof Error ? error.message : "unknown error" });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
