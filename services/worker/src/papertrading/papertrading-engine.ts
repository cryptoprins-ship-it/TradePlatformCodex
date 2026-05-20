import { type AppConfig, type PaperTradeInput } from "@tradeplatformcodex/shared";
import { prisma } from "../db";
import { logBot } from "../logging/bot-log";
import { evaluateRisk } from "../risk/risk-manager";

export async function openPaperTrade(config: AppConfig, signal: PaperTradeInput): Promise<string | null> {
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

export async function monitorOpenPaperTrades(currentPrice: number): Promise<void> {
  const openTrades = await prisma.trade.findMany({ where: { status: "OPEN" } });
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
      const pnlPercentage = ((currentPrice - entry) / entry) * 100 * (isLong ? 1 : -1);
      await prisma.trade.update({
        where: { id: trade.id },
        data: {
          status: stopHit ? "STOP_LOSS_HIT" : "TP2_HIT",
          exitPrice: currentPrice,
          pnlPercentage,
          result: stopHit ? "LOSS" : "WIN",
          closedAt: new Date(),
          events: {
            create: {
              eventType: stopHit ? "STOP_LOSS_HIT" : "TP2_HIT",
              message: stopHit ? "Stop loss hit" : "Take profit 2 hit",
              price: currentPrice
            }
          }
        }
      });
      continue;
    }

    if (tp1Hit) {
      await prisma.trade.update({
        where: { id: trade.id },
        data: {
          status: "TP1_HIT",
          events: {
            create: {
              eventType: "TP1_HIT",
              message: "Take profit 1 hit; trade remains monitored",
              price: currentPrice
            }
          }
        }
      });
    }
  }
}

