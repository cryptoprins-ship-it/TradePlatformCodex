import { type AppConfig, type PaperTradeInput, type SupportedSymbol } from "@tradeplatformcodex/shared";
import { prisma } from "../db";
import { logBot } from "../logging/bot-log";
import { getActiveRunId } from "../run-context";
import { evaluateRisk } from "../risk/risk-manager";

export async function openPaperTrade(config: AppConfig, signal: PaperTradeInput): Promise<string | null> {
  const runId = getActiveRunId();
  const risk = await evaluateRisk(config, signal);
  if (!risk.allowed) {
    await prisma.signal.update({
      where: { id: signal.signalId },
      data: { status: "SKIPPED" }
    });
    await logBot("info", "Trade skipped", {
      symbol: signal.symbol,
      timeframe: signal.timeframe,
      score: signal.score,
      reasons: risk.reasons
    });
    return null;
  }

  const riskDistance = Math.abs(signal.entryPrice - signal.stopLoss);
  const rewardDistance = Math.abs(signal.takeProfit2 - signal.entryPrice);
  const riskReward = riskDistance === 0 ? 0 : rewardDistance / riskDistance;

  const trade = await prisma.trade.create({
    data: {
      ...(runId ? { runId } : {}),
      signalId: signal.signalId,
      symbol: signal.symbol,
      timeframe: signal.timeframe,
      direction: signal.direction,
      entryPrice: signal.entryPrice,
      stopLoss: signal.stopLoss,
      takeProfit1: signal.takeProfit1,
      takeProfit2: signal.takeProfit2,
      confidenceScore: signal.score,
      riskReward,
      technicalReason: signal.reason,
      strategyModulesUsed: signal.moduleScores.map((module) => module.module),
      mode: "PAPER",
      events: {
        create: {
          eventType: "OPENED",
          message: "Papertrade opened after risk checks",
          price: signal.entryPrice
        }
      }
    }
  });

  await prisma.signal.update({
    where: { id: signal.signalId },
    data: { status: "TRADE_OPENED" }
  });
  await logBot("info", "Papertrade opened", { tradeId: trade.id, symbol: signal.symbol, score: signal.score });
  return trade.id;
}

export async function monitorOpenPaperTrades(config: AppConfig, symbol: SupportedSymbol, currentPrice: number): Promise<void> {
  const runId = getActiveRunId();
  const openTrades = await prisma.trade.findMany({
    where: {
      ...(runId ? { runId } : {}),
      symbol,
      status: { in: ["OPEN", "TP1_HIT"] }
    }
  });
  for (const trade of openTrades) {
    const entry = Number(trade.entryPrice);
    const stopLoss = Number(trade.stopLoss);
    const tp1 = Number(trade.takeProfit1);
    const tp2 = Number(trade.takeProfit2);
    const isLong = trade.direction === "LONG";
    const stopHit = isLong ? currentPrice <= stopLoss : currentPrice >= stopLoss;
    const tp2Hit = isLong ? currentPrice >= tp2 : currentPrice <= tp2;
    const tp1Hit = isLong ? currentPrice >= tp1 : currentPrice <= tp1;

    if (stopHit || tp2Hit) {
      const slippageBps = config.SLIPPAGE_BPS;
      // Stop = market order: fill at the stop level plus adverse slippage.
      // TP2 = limit order: fills at the level. This bounds the recorded loss to
      // the stop distance + slippage instead of the coarsely polled overshoot
      // (the monitor only sees one ticker price per WORKER_INTERVAL_SECONDS).
      const exitPrice = stopHit
        ? isLong
          ? stopLoss * (1 - slippageBps / 10000)
          : stopLoss * (1 + slippageBps / 10000)
        : tp2;
      const pnlPercentage = ((exitPrice - entry) / entry) * 100 * (isLong ? 1 : -1);
      const triggerLevel = stopHit ? stopLoss : tp2;
      const deviationBps = triggerLevel === 0 ? 0 : Math.abs((currentPrice - triggerLevel) / triggerLevel) * 10000;
      await prisma.trade.update({
        where: { id: trade.id },
        data: {
          status: stopHit ? "STOP_LOSS_HIT" : "TP2_HIT",
          exitPrice,
          pnlPercentage,
          // Use realized pnl sign: a stop moved to breakeven after TP1 scratches
          // at ~0% and must not be miscounted as a loss.
          result: pnlPercentage >= 0 ? "WIN" : "LOSS",
          closedAt: new Date(),
          events: {
            create: {
              eventType: stopHit ? "STOP_LOSS_HIT" : "TP2_HIT",
              message: stopHit
                ? `Stop loss hit; filled ${exitPrice.toFixed(8)} (level ${stopLoss}, observed ${currentPrice}, slip ${slippageBps}bps)`
                : `Take profit 2 hit; filled ${exitPrice.toFixed(8)}`,
              price: exitPrice
            }
          }
        }
      });
      await logBot("info", stopHit ? "Papertrade stop loss hit" : "Papertrade take profit 2 hit", {
        tradeId: trade.id,
        symbol: trade.symbol,
        timeframe: trade.timeframe,
        direction: trade.direction,
        pnlPercentage,
        exitPrice,
        deviationBps
      });
      // Large gap between trigger level and observed price = a coarse poll caught
      // price well past the level, or the live market gapped. Surface it instead
      // of silently absorbing it into pnl.
      if (deviationBps > slippageBps * 5) {
        await logBot("warn", "Fill deviation high: price was well past trigger when observed", {
          tradeId: trade.id,
          symbol: trade.symbol,
          triggerLevel,
          observedPrice: currentPrice,
          deviationBps
        });
      }
      continue;
    }

    if (tp1Hit && trade.status === "OPEN") {
      await prisma.trade.update({
        where: { id: trade.id },
        data: {
          status: "TP1_HIT",
          // Move stop to breakeven once TP1 is reached so a reversal scratches
          // the trade instead of giving back the move to the original stop.
          stopLoss: entry,
          events: {
            create: {
              eventType: "TP1_HIT",
              message: `Take profit 1 hit; stop moved to breakeven (${stopLoss} -> ${entry})`,
              price: currentPrice
            }
          }
        }
      });
      await logBot("info", "Papertrade take profit 1 hit", {
        tradeId: trade.id,
        symbol: trade.symbol,
        timeframe: trade.timeframe,
        direction: trade.direction
      });
    }
  }
}
