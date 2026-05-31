import { round, type AppConfig } from "@tradeplatformcodex/shared";
import { prisma } from "../db";
import { logBot } from "../logging/bot-log";
import { getActiveRunId } from "../run-context";
import { sendTelegram } from "../alerts/telegram";

export interface DailyStats {
  trades: number;
  wins: number;
  losses: number;
  winrate: number;
  pnlPercentage: number;
  pnlAmount: number;
  profitFactor: number;
  averageRiskReward: number;
}

interface ClosedTradeRow {
  result: string | null;
  pnlPercentage: number | null;
  pnlAmount: number | null;
  riskReward: number;
}

// Pure summary of one day's closed trades. Mirrors the dashboard's per-strategy
// math so the Telegram report and the web view never disagree.
export function summarizeDay(trades: ClosedTradeRow[]): DailyStats {
  const wins = trades.filter((trade) => trade.result === "WIN").length;
  const losses = trades.filter((trade) => trade.result === "LOSS").length;
  const grossProfit = trades.reduce((sum, trade) => {
    const pnl = Number(trade.pnlPercentage ?? 0);
    return pnl > 0 ? sum + pnl : sum;
  }, 0);
  const grossLoss = Math.abs(
    trades.reduce((sum, trade) => {
      const pnl = Number(trade.pnlPercentage ?? 0);
      return pnl < 0 ? sum + pnl : sum;
    }, 0)
  );
  return {
    trades: trades.length,
    wins,
    losses,
    winrate: wins + losses === 0 ? 0 : (wins / (wins + losses)) * 100,
    pnlPercentage: trades.reduce((sum, trade) => sum + Number(trade.pnlPercentage ?? 0), 0),
    pnlAmount: trades.reduce((sum, trade) => sum + Number(trade.pnlAmount ?? 0), 0),
    profitFactor: grossLoss === 0 ? grossProfit : grossProfit / grossLoss,
    averageRiskReward: trades.length === 0 ? 0 : trades.reduce((sum, trade) => sum + Number(trade.riskReward), 0) / trades.length
  };
}

export function formatDailyReport(strategy: string, day: string, stats: DailyStats): string {
  return [
    `${strategy} — daily report ${day}`,
    `Trades: ${stats.trades} (${stats.wins}W / ${stats.losses}L)`,
    `Winrate: ${round(stats.winrate, 1)}%`,
    `P/L: ${round(stats.pnlPercentage, 2)}% (${round(stats.pnlAmount, 2)} EUR)`,
    `Profit factor: ${round(stats.profitFactor, 2)}`,
    `Avg R/R: ${round(stats.averageRiskReward, 2)}`,
    "Mode: PAPER"
  ].join("\n");
}

// Local-day key (YYYY-MM-DD) and local midnight, so the report rolls over with the
// VPS's wall clock rather than UTC.
function dayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const dayOfMonth = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${dayOfMonth}`;
}

function startOfLocalDay(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

let lastReportDay: string | null = null;

// Exposed for tests: reset the in-memory day cursor.
export function resetDailyReportCursor(): void {
  lastReportDay = null;
}

// Fire once per local day. On the first call we only arm the cursor (so a restart
// never replays an old day); on the first cycle after midnight we report the day
// that just ended for THIS worker's run only — so Scalp and Swing each post their
// own summary and never duplicate a shared report.
export async function maybeSendDailyReport(config: AppConfig, now: Date = new Date()): Promise<void> {
  if (!config.DAILY_REPORT_ENABLED) {
    return;
  }
  const today = dayKey(now);
  if (lastReportDay === null) {
    lastReportDay = today;
    return;
  }
  if (today === lastReportDay) {
    return;
  }
  lastReportDay = today;

  const startToday = startOfLocalDay(now);
  const startYesterday = new Date(startToday);
  startYesterday.setDate(startYesterday.getDate() - 1);
  const reportedDay = dayKey(startYesterday);

  const runId = getActiveRunId();
  const trades = (await prisma.trade.findMany({
    where: {
      ...(runId ? { runId } : {}),
      closedAt: { gte: startYesterday, lt: startToday }
    },
    select: { result: true, pnlPercentage: true, pnlAmount: true, riskReward: true }
  })) as unknown as ClosedTradeRow[];

  const stats = summarizeDay(trades);
  const message = formatDailyReport(config.APP_NAME, reportedDay, stats);
  await sendTelegram(config, message);
  await logBot("info", "Daily report", { day: reportedDay, strategy: config.APP_NAME, ...stats });
}
