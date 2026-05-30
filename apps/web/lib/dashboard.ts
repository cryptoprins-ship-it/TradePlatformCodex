import { loadConfig } from "@tradeplatformcodex/shared";
import { prisma } from "./prisma";

type ConfigSnapshot = Record<string, unknown>;

type RunSummary = {
  id: string;
  name: string;
  configHash: string;
  status: string;
  startedAt: Date;
  lastSeenAt: Date;
  stoppedAt: Date | null;
  snapshot: {
    symbols: string[];
    timeframes: string[];
    tradingMode: string;
    minConfidenceScore: number;
    maxScoreWithoutLiquiditySweep: number;
    killSwitch: boolean;
  };
  signals: number;
  skippedSignals: number;
  openTrades: number;
  closedTrades: number;
  winrate: number;
  pnl: number;
  profitFactor: number;
  averageRiskReward: number;
};

type TradeRow = Awaited<ReturnType<typeof prisma.trade.findMany>>[number] & {
  run?: { name: string; configHash: string | null } | null;
};

function readStringArray(snapshot: ConfigSnapshot, key: string): string[] {
  const value = snapshot[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function readNumber(snapshot: ConfigSnapshot, key: string, fallback = 0): number {
  const value = snapshot[key];
  return typeof value === "number" ? value : fallback;
}

function readBoolean(snapshot: ConfigSnapshot, key: string): boolean {
  return snapshot[key] === true;
}

function summarizeClosedTrades(closedTrades: TradeRow[]): { winrate: number; pnl: number; profitFactor: number; averageRiskReward: number } {
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
  const averageRiskReward = closedTrades.length === 0 ? 0 : closedTrades.reduce((sum, trade) => sum + Number(trade.riskReward), 0) / closedTrades.length;

  return {
    winrate: wins + losses === 0 ? 0 : (wins / (wins + losses)) * 100,
    pnl: closedTrades.reduce((sum, trade) => sum + Number(trade.pnlPercentage ?? 0), 0),
    profitFactor: grossLoss === 0 ? grossProfit : grossProfit / grossLoss,
    averageRiskReward
  };
}

function summarizeByRegime(closedTrades: TradeRow[]) {
  const groups = new Map<string, TradeRow[]>();
  for (const trade of closedTrades) {
    const regime = (trade as { entryRegime?: string | null }).entryRegime ?? "UNKNOWN";
    const list = groups.get(regime) ?? [];
    list.push(trade);
    groups.set(regime, list);
  }
  return Array.from(groups.entries())
    .map(([regime, trades]) => {
      const perf = summarizeClosedTrades(trades);
      return { regime, trades: trades.length, winrate: perf.winrate, pnl: perf.pnl, profitFactor: perf.profitFactor };
    })
    .sort((a, b) => b.pnl - a.pnl);
}

async function summarizeRun(
  run: { id: string; name: string; configHash: string; status: string; startedAt: Date; lastSeenAt: Date; stoppedAt: Date | null; configSnapshot: unknown },
  from?: Date
): Promise<RunSummary> {
  const snapshot = (run.configSnapshot ?? {}) as ConfigSnapshot;
  const createdFilter = from ? { createdAt: { gte: from } } : {};
  const openedFilter = from ? { openedAt: { gte: from } } : {};
  const closedFilter = from ? { closedAt: { gte: from } } : { closedAt: { not: null } };
  const [signals, openTrades, closedTrades, skippedSignals] = await Promise.all([
    prisma.signal.count({ where: { runId: run.id, ...createdFilter } }),
    prisma.trade.findMany({
      where: { runId: run.id, status: { in: ["OPEN", "TP1_HIT"] }, ...openedFilter },
      orderBy: { openedAt: "desc" }
    }),
    prisma.trade.findMany({
      where: { runId: run.id, ...closedFilter },
      orderBy: { closedAt: "desc" },
      take: 50
    }),
    prisma.signal.count({ where: { runId: run.id, status: "SKIPPED", ...createdFilter } })
  ]);

  const performance = summarizeClosedTrades(closedTrades);
  return {
    id: run.id,
    name: run.name,
    configHash: run.configHash,
    status: run.status,
    startedAt: run.startedAt,
    lastSeenAt: run.lastSeenAt,
    stoppedAt: run.stoppedAt,
    snapshot: {
      symbols: readStringArray(snapshot, "SYMBOLS"),
      timeframes: readStringArray(snapshot, "TIMEFRAMES"),
      tradingMode: String(snapshot.TRADING_MODE ?? "paper"),
      minConfidenceScore: readNumber(snapshot, "MIN_CONFIDENCE_SCORE"),
      maxScoreWithoutLiquiditySweep: readNumber(snapshot, "MAX_SCORE_WITHOUT_LIQUIDITY_SWEEP", 74),
      killSwitch: readBoolean(snapshot, "KILL_SWITCH")
    },
    signals,
    skippedSignals,
    openTrades: openTrades.length,
    closedTrades: closedTrades.length,
    ...performance
  };
}

export async function getDashboardData(options: { from?: Date } = {}) {
  const config = loadConfig();
  const from = options.from;
  const createdFilter = from ? { createdAt: { gte: from } } : {};
  const openedFilter = from ? { openedAt: { gte: from } } : {};
  const closedFilter = from ? { closedAt: { gte: from } } : { closedAt: { not: null } };
  const runs = await prisma.botRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 2
  });
  const currentRun = runs[0] ? await summarizeRun(runs[0], from) : null;
  const previousRun = runs[1] ? await summarizeRun(runs[1], from) : null;
  // Main metrics span every run (including legacy null-runId rows); the date
  // filter is the only scope. Run comparison above stays per-run.
  const [symbols, signals, openTrades, closedTrades, skippedSignals, logs] = await Promise.all([
    prisma.symbol.findMany({ where: { isActive: true } }),
    prisma.signal.findMany({
      where: { ...createdFilter },
      include: { run: { select: { name: true, configHash: true } } },
      orderBy: { createdAt: "desc" },
      take: 8
    }),
    prisma.trade.findMany({
      where: { status: { in: ["OPEN", "TP1_HIT"] }, ...openedFilter },
      include: { run: { select: { name: true, configHash: true } } },
      orderBy: { openedAt: "desc" }
    }),
    prisma.trade.findMany({
      where: { ...closedFilter },
      include: { run: { select: { name: true, configHash: true } } },
      orderBy: { closedAt: "desc" },
      take: 50
    }),
    prisma.signal.count({ where: { status: "SKIPPED", ...createdFilter } }),
    prisma.botLog.findMany({
      where: { ...createdFilter },
      include: { run: { select: { name: true, configHash: true } } },
      orderBy: { createdAt: "desc" },
      take: 5
    })
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
    from: from ?? null,
    runs: { current: currentRun, previous: previousRun },
    symbols,
    signals,
    openTrades,
    closedTrades,
    skippedSignals,
    logs,
    regimeBreakdown: summarizeByRegime(closedTrades),
    currentRegime:
      ((openTrades[0] ?? closedTrades[0]) as { entryRegime?: string | null } | undefined)?.entryRegime ?? null,
    winrate: wins + losses === 0 ? 0 : (wins / (wins + losses)) * 100,
    pnl: closedTrades.reduce((sum, trade) => sum + Number(trade.pnlPercentage ?? 0), 0),
    profitFactor: grossLoss === 0 ? grossProfit : grossProfit / grossLoss,
    averageRiskReward
  };
}
