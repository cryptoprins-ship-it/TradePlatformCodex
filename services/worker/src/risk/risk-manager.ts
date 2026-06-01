import { type AppConfig, type PaperTradeInput, type RiskSnapshot } from "@tradeplatformcodex/shared";
import { prisma } from "../db";
import { getActiveRunId } from "../run-context";

export async function evaluateRisk(config: AppConfig, signal: PaperTradeInput): Promise<RiskSnapshot> {
  const reasons: string[] = [];
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const runId = getActiveRunId();
  const runFilter = runId ? { runId } : {};

  if (config.KILL_SWITCH) {
    reasons.push("KILL_SWITCH active: new trades blocked");
  }
  if (config.ENABLE_LIVE_TRADING) {
    reasons.push("live trading is not allowed in phase 1A");
  }
  if (signal.score < config.MIN_CONFIDENCE_SCORE) {
    reasons.push(`score ${signal.score} below required threshold ${config.MIN_CONFIDENCE_SCORE}`);
  }
  if (!signal.stopLoss || !signal.takeProfit1 || !signal.takeProfit2) {
    reasons.push("missing stop loss or take profit");
  }
  if (!signal.entryPrice || signal.entryPrice <= 0) {
    reasons.push("missing valid entry price");
  }

  const openTrades = await prisma.trade.count({
    where: { ...runFilter, status: { in: ["OPEN", "TP1_HIT"] } }
  });
  if (openTrades >= config.MAX_OPEN_TRADES) {
    reasons.push(`max open trades reached (${config.MAX_OPEN_TRADES})`);
  }

  const openForSymbol = await prisma.trade.count({
    where: { ...runFilter, symbol: signal.symbol, status: { in: ["OPEN", "TP1_HIT"] } }
  });
  if (openForSymbol >= config.MAX_OPEN_TRADES_PER_SYMBOL) {
    reasons.push(`max open trades per symbol reached (${config.MAX_OPEN_TRADES_PER_SYMBOL})`);
  }

  // De-duplicate the same setup: a persistent signal regenerates every cycle, so
  // without this an unchanged setup would open a fresh trade each cycle (stacking
  // 2x risk on one idea until the per-symbol cap stops it). One position per
  // symbol+direction+timeframe per strategy.
  const duplicateSetup = await prisma.trade.count({
    where: {
      ...runFilter,
      symbol: signal.symbol,
      direction: signal.direction,
      timeframe: signal.timeframe,
      status: { in: ["OPEN", "TP1_HIT"] }
    }
  });
  if (duplicateSetup > 0) {
    reasons.push(`duplicate setup already open (${signal.symbol} ${signal.direction} ${signal.timeframe})`);
  }

  const todaysTrades = await prisma.trade.count({
    where: { ...runFilter, openedAt: { gte: startOfDay } }
  });
  if (todaysTrades >= config.MAX_TRADES_PER_DAY) {
    reasons.push(`max trades per day reached (${config.MAX_TRADES_PER_DAY})`);
  }

  const closedToday = await prisma.trade.findMany({
    where: {
      ...runFilter,
      closedAt: { gte: startOfDay },
      pnlPercentage: { not: null }
    },
    select: { pnlPercentage: true }
  });
  const dailyPnl = closedToday.reduce((sum, trade) => sum + Number(trade.pnlPercentage), 0);
  if (dailyPnl <= -Math.abs(config.MAX_DAILY_LOSS)) {
    reasons.push(`daily loss limit reached (${config.MAX_DAILY_LOSS}%)`);
  }

  return { allowed: reasons.length === 0, reasons };
}
