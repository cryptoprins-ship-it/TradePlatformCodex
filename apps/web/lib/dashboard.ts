import { loadConfig } from "@tradeplatformcodex/shared";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

// Group skipped-trade reasons into a handful of buckets so the dashboard can
// show WHY signals are skipped instead of a flood of individual rows. Reasons
// are logged per skip in bot_logs.context.reasons by the risk manager.
async function summarizeSkipReasons(from?: Date): Promise<{ bucket: string; count: number }[]> {
  const rows = await prisma.$queryRaw<{ bucket: string; count: bigint }[]>`
    SELECT
      CASE
        WHEN reason LIKE 'max open trades%' THEN 'Max open trades'
        WHEN reason LIKE 'max trades per day%' THEN 'Max trades/day'
        WHEN reason LIKE 'score %below required threshold%' THEN 'Below score threshold'
        WHEN reason LIKE 'daily loss limit%' THEN 'Daily loss limit'
        WHEN reason LIKE 'duplicate setup%' THEN 'Duplicate setup'
        WHEN reason LIKE 'KILL_SWITCH%' THEN 'Kill switch'
        WHEN reason LIKE 'missing %' THEN 'Missing stop/target/entry'
        ELSE 'Other'
      END AS bucket,
      count(*) AS count
    FROM bot_logs, LATERAL jsonb_array_elements_text(context->'reasons') AS reason
    WHERE message = 'Trade skipped'
      ${from ? Prisma.sql`AND "createdAt" >= ${from}` : Prisma.empty}
    GROUP BY bucket
    ORDER BY count DESC
  `;
  return rows.map((row) => ({ bucket: row.bucket, count: Number(row.count) }));
}

// Live spot prices from MEXC (public, no key). One call, filtered to the symbols
// we need, so the dashboard can show where open trades stand right now.
async function fetchPrices(symbols: string[]): Promise<Map<string, number>> {
  if (symbols.length === 0) return new Map();
  try {
    const res = await fetch("https://api.mexc.com/api/v3/ticker/price", { cache: "no-store" });
    if (!res.ok) return new Map();
    const all = (await res.json()) as { symbol: string; price: string }[];
    const wanted = new Set(symbols);
    return new Map(all.filter((row) => wanted.has(row.symbol)).map((row) => [row.symbol, Number(row.price)]));
  } catch {
    return new Map();
  }
}

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

// Compare strategies (Scalp vs Swing) by grouping runs on their APP_NAME and
// summarising each strategy's closed trades — winrate, P/L (% and money).
async function summarizeByStrategy(closedFilter: object): Promise<
  { strategy: string; trades: number; winrate: number; pnl: number; pnlAmount: number; profitFactor: number }[]
> {
  const runs = await prisma.botRun.findMany();
  const runIdsByStrategy = new Map<string, string[]>();
  for (const run of runs) {
    const strategy = String((run.configSnapshot as Record<string, unknown> | null)?.APP_NAME ?? "Unknown");
    runIdsByStrategy.set(strategy, [...(runIdsByStrategy.get(strategy) ?? []), run.id]);
  }

  const stats = await Promise.all(
    Array.from(runIdsByStrategy.entries()).map(async ([strategy, runIds]) => {
      const trades = (await prisma.trade.findMany({ where: { runId: { in: runIds }, ...closedFilter } })) as TradeRow[];
      const perf = summarizeClosedTrades(trades);
      const pnlAmount = trades.reduce((sum, trade) => sum + Number(trade.pnlAmount ?? 0), 0);
      return { strategy, trades: trades.length, winrate: perf.winrate, pnl: perf.pnl, pnlAmount, profitFactor: perf.profitFactor };
    })
  );
  return stats.filter((stat) => stat.trades > 0).sort((a, b) => b.trades - a.trades);
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

  const skipReasonGroups = await summarizeSkipReasons(from);
  const strategyComparison = await summarizeByStrategy(closedFilter);

  // Money view: balance = starting balance + realized P/L (compounding). Realized
  // P/L sums pnlAmount over every closed trade in scope, not just the 50 shown.
  const realizedAgg = await prisma.trade.aggregate({
    _sum: { pnlAmount: true },
    where: { pnlAmount: { not: null }, ...closedFilter }
  });
  const startBalance = config.START_BALANCE;
  const realizedPnlAmount = Number(realizedAgg._sum.pnlAmount ?? 0);
  const balance = startBalance + realizedPnlAmount;

  // Live prices for the basket + per-open-trade unrealized P/L (is it going the
  // right way right now?). Direction-aware: a SHORT profits when price falls.
  const activeSymbols = symbols.map((symbol) => symbol.symbol);
  const priceSymbols = Array.from(new Set([...activeSymbols, ...openTrades.map((trade) => trade.symbol)]));
  const priceMap = await fetchPrices(priceSymbols);
  const prices = activeSymbols
    .map((symbol) => ({ symbol, price: priceMap.get(symbol) ?? null }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
  const openTradesLive = openTrades.map((trade) => {
    const current = priceMap.get(trade.symbol) ?? null;
    const entry = Number(trade.entryPrice);
    const unrealizedPct =
      current !== null && entry > 0 ? ((current - entry) / entry) * 100 * (trade.direction === "LONG" ? 1 : -1) : null;
    return {
      id: trade.id,
      run: trade.run?.name ?? "Legacy",
      symbol: trade.symbol,
      direction: trade.direction,
      timeframe: trade.timeframe,
      status: trade.status,
      score: trade.confidenceScore,
      entry,
      current,
      unrealizedPct
    };
  });

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
    openTradesLive,
    prices,
    closedTrades,
    skippedSignals,
    skipReasonGroups,
    strategyComparison,
    startBalance,
    realizedPnlAmount,
    balance,
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
