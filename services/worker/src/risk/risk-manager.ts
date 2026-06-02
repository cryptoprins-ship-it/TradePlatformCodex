import { type AppConfig, type PaperTradeInput, type RiskSnapshot } from "@tradeplatformcodex/shared";
import { prisma } from "../db";
import { getActiveRunId } from "../run-context";

// Confidence ramp. Below the soft cap the base score applies; from the cap onward
// each additional open trade raises the required score by 1, so the book only
// grows past the cap for progressively stronger setups. Pure + stateless: it reads
// the current open count each time, so it resets automatically as trades close and
// the count falls back under the cap. With base 67 + cap 10: 0-9 open -> 67,
// 10 -> 68, 11 -> 69, ... (naturally dies out near 100, a soft infinite ceiling).
export function requiredConfidence(openTrades: number, baseScore: number, softCap: number): number {
  return baseScore + Math.max(0, openTrades - (softCap - 1));
}

export async function evaluateRisk(config: AppConfig, signal: PaperTradeInput): Promise<RiskSnapshot> {
  const reasons: string[] = [];
  const runId = getActiveRunId();
  const runFilter = runId ? { runId } : {};

  if (config.KILL_SWITCH) {
    reasons.push("KILL_SWITCH active: new trades blocked");
  }
  if (config.ENABLE_LIVE_TRADING) {
    reasons.push("live trading is not allowed in phase 1A");
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
  // Dynamic threshold replaces the old hard open-trades ceiling: no fixed max on
  // trade count, just a rising confidence bar past the soft cap.
  const required = requiredConfidence(openTrades, config.MIN_CONFIDENCE_SCORE, config.MAX_OPEN_TRADES);
  if (signal.score < required) {
    reasons.push(`score ${signal.score} below required threshold ${required} (${openTrades} open, soft cap ${config.MAX_OPEN_TRADES})`);
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

  // No hard daily trade cap: with a large basket the confidence ramp + per-symbol
  // cap govern how many trades open, not a fixed count. The daily LOSS limit below
  // is the remaining day-level rail.
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

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
