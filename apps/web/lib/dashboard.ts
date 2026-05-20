import { loadConfig } from "@tradeplatformcodex/shared";
import { prisma } from "./prisma";

export async function getDashboardData() {
  const config = loadConfig();
  const [symbols, signals, openTrades, closedTrades, skippedSignals, logs] = await Promise.all([
    prisma.symbol.findMany({ where: { isActive: true } }),
    prisma.signal.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
    prisma.trade.findMany({ where: { status: { in: ["OPEN", "TP1_HIT"] } }, orderBy: { openedAt: "desc" } }),
    prisma.trade.findMany({ where: { closedAt: { not: null } }, orderBy: { closedAt: "desc" }, take: 50 }),
    prisma.signal.count({ where: { status: "SKIPPED" } }),
    prisma.botLog.findMany({ orderBy: { createdAt: "desc" }, take: 5 })
  ]);

  const wins = closedTrades.filter((trade) => trade.result === "WIN").length;
  const losses = closedTrades.filter((trade) => trade.result === "LOSS").length;
  const grossProfit = closedTrades.reduce((sum, trade) => {
    const pnl = Number(trade.pnlPercentage ?? 0);
    return pnl > 0 ? sum + pnl : sum;
  }, 0);
  const grossLoss = Math.abs(
    closedTrades.reduce((sum, trade) => {
      const pnl = Number(trade.pnlPercentage ?? 0);
      return pnl < 0 ? sum + pnl : sum;
    }, 0)
  );
  const averageRiskReward =
    closedTrades.length === 0 ? 0 : closedTrades.reduce((sum, trade) => sum + Number(trade.riskReward), 0) / closedTrades.length;

  return {
    config,
    symbols,
    signals,
    openTrades,
    closedTrades,
    skippedSignals,
    logs,
    winrate: wins + losses === 0 ? 0 : (wins / (wins + losses)) * 100,
    pnl: closedTrades.reduce((sum, trade) => sum + Number(trade.pnlPercentage ?? 0), 0),
    profitFactor: grossLoss === 0 ? grossProfit : grossProfit / grossLoss,
    averageRiskReward
  };
}

