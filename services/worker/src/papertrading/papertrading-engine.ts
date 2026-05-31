import { type AppConfig, type PaperTradeInput, type SupportedSymbol } from "@tradeplatformcodex/shared";
import { prisma } from "../db";
import { logBot } from "../logging/bot-log";
import { getActiveRunId } from "../run-context";
import { evaluateRisk } from "../risk/risk-manager";
import { computePnlAmount, computePositionNotional } from "./position-sizing";

// Current account balance for the run: the starting balance plus realized P/L
// from already-closed trades. Compounding — new trades size off this.
async function currentBalance(config: AppConfig, runId: string | null): Promise<number> {
  const realized = await prisma.trade.aggregate({
    _sum: { pnlAmount: true },
    where: { ...(runId ? { runId } : {}), pnlAmount: { not: null } }
  });
  return config.START_BALANCE + Number(realized._sum.pnlAmount ?? 0);
}

export interface OpenPaperTradeOptions {
  // Resolves the current market price for a symbol, used to realize an evicted
  // trade at market. Absent (e.g. in tests) the evicted trade closes at its entry.
  resolvePrice?: (symbol: SupportedSymbol) => Promise<number>;
}

const CAPACITY_REASON_PREFIX = "max open trades";

export interface EvictionCandidate {
  id: string;
  symbol: string;
  confidenceScore: number;
  openedAt: Date;
}

// Pure decision for golden-setup eviction: given the incoming score, the risk
// reasons that blocked it, and the currently open trades, return the trade to
// evict or null. Evicts ONLY when the block is purely a capacity cap and the
// newcomer scores >= GOLDEN_SCORE and strictly outscores the weakest trade in
// the binding pool (per-symbol cap -> that symbol; total cap -> all). Discipline
// limits (score, kill switch, daily loss, trades/day) never evict.
export function selectEvictionTarget<T extends EvictionCandidate>(
  signalScore: number,
  goldenScore: number,
  reasons: string[],
  symbol: string,
  openTrades: T[]
): T | null {
  if (signalScore < goldenScore) {
    return null;
  }
  if (reasons.length === 0 || !reasons.every((reason) => reason.startsWith(CAPACITY_REASON_PREFIX))) {
    return null;
  }
  // A full per-symbol cap is the binding constraint for this symbol's new trade,
  // so evict within the symbol; otherwise the total cap is full, evict globally.
  const perSymbolBound = reasons.some((reason) => reason.includes("per symbol"));
  const pool = perSymbolBound ? openTrades.filter((trade) => trade.symbol === symbol) : openTrades;
  const weakest = [...pool].sort(
    (a, b) => a.confidenceScore - b.confidenceScore || a.openedAt.getTime() - b.openedAt.getTime()
  )[0];
  if (!weakest || signalScore <= weakest.confidenceScore) {
    return null;
  }
  return weakest;
}

// Closes the weakest open trade to free a slot for a golden setup. Returns true
// when a slot was freed. The evicted trade is realized at the current market price
// when a resolver is supplied, otherwise at its entry (a breakeven scratch).
async function tryGoldenEviction(
  config: AppConfig,
  signal: PaperTradeInput,
  reasons: string[],
  resolvePrice?: (symbol: SupportedSymbol) => Promise<number>
): Promise<boolean> {
  if (signal.score < config.GOLDEN_SCORE) {
    return false;
  }
  const runId = getActiveRunId();
  const runFilter = runId ? { runId } : {};
  const openTrades = await prisma.trade.findMany({
    where: { ...runFilter, status: { in: ["OPEN", "TP1_HIT"] } }
  });
  const weakest = selectEvictionTarget(signal.score, config.GOLDEN_SCORE, reasons, signal.symbol, openTrades);
  if (!weakest) {
    return false;
  }

  const entry = Number(weakest.entryPrice);
  const isLong = weakest.direction === "LONG";
  const exitPrice = resolvePrice ? await resolvePrice(weakest.symbol as SupportedSymbol) : entry;
  const pnlPercentage = entry === 0 ? 0 : ((exitPrice - entry) / entry) * 100 * (isLong ? 1 : -1);
  const pnlAmount = computePnlAmount(Number(weakest.positionNotional ?? 0), pnlPercentage);

  await prisma.trade.update({
    where: { id: weakest.id },
    data: {
      status: "CLOSED",
      exitPrice,
      pnlPercentage,
      pnlAmount,
      result: pnlPercentage >= 0 ? "WIN" : "LOSS",
      closedAt: new Date(),
      events: {
        create: {
          eventType: "EVICTED",
          message: `Closed to free a slot for a golden setup (incoming score ${signal.score} > ${weakest.confidenceScore}); filled ${exitPrice}`,
          price: exitPrice
        }
      }
    }
  });
  await logBot("info", "Papertrade evicted for golden setup", {
    evictedTradeId: weakest.id,
    evictedSymbol: weakest.symbol,
    evictedScore: weakest.confidenceScore,
    incomingSymbol: signal.symbol,
    incomingScore: signal.score,
    pnlPercentage
  });
  return true;
}

export async function openPaperTrade(
  config: AppConfig,
  signal: PaperTradeInput,
  options: OpenPaperTradeOptions = {}
): Promise<string | null> {
  const runId = getActiveRunId();
  let risk = await evaluateRisk(config, signal);
  if (!risk.allowed && (await tryGoldenEviction(config, signal, risk.reasons, options.resolvePrice))) {
    // A slot was freed — re-run the full risk gate before opening.
    risk = await evaluateRisk(config, signal);
  }
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

  const balance = await currentBalance(config, runId);
  const positionNotional = computePositionNotional(balance, config.MAX_RISK_PER_TRADE, signal.entryPrice, signal.stopLoss);

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
      positionNotional,
      riskReward,
      trailAtrMultiple: signal.trailAtrMultiple,
      entryRegime: signal.entryRegime,
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
    let stopLoss = Number(trade.stopLoss);
    const tp1 = Number(trade.takeProfit1);
    const tp2 = Number(trade.takeProfit2);
    const isLong = trade.direction === "LONG";
    const trailing = trade.status === "TP1_HIT";

    // Once TP1 is hit, trailing is armed: ratchet the stop toward profit by the
    // entry-chosen ATR multiple before evaluating exits. ATR is recovered from
    // the stored TP1 (TP1 = entry +/- 1.5*ATR). The stop never loosens.
    if (trailing) {
      const atr = Math.abs(tp1 - entry) / 1.5;
      const trailMult = Number(trade.trailAtrMultiple ?? config.TRAIL_CHOP_ATR_MULT);
      const trailStop = isLong ? currentPrice - atr * trailMult : currentPrice + atr * trailMult;
      const ratcheted = isLong ? Math.max(stopLoss, trailStop) : Math.min(stopLoss, trailStop);
      if (ratcheted !== stopLoss) {
        stopLoss = ratcheted;
        await prisma.trade.update({ where: { id: trade.id }, data: { stopLoss } });
      }
    }

    const stopHit = isLong ? currentPrice <= stopLoss : currentPrice >= stopLoss;
    // TP2 is only a hard cap before trailing arms; once trailing, the ratcheting
    // stop governs the exit so strong trends can run past TP2.
    const tp2Hit = !trailing && (isLong ? currentPrice >= tp2 : currentPrice <= tp2);
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
      const pnlAmount = computePnlAmount(Number(trade.positionNotional ?? 0), pnlPercentage);
      const triggerLevel = stopHit ? stopLoss : tp2;
      const deviationBps = triggerLevel === 0 ? 0 : Math.abs((currentPrice - triggerLevel) / triggerLevel) * 10000;
      await prisma.trade.update({
        where: { id: trade.id },
        data: {
          status: stopHit ? "STOP_LOSS_HIT" : "TP2_HIT",
          exitPrice,
          pnlPercentage,
          pnlAmount,
          // Use realized pnl sign: a stop moved to breakeven after TP1 scratches
          // at ~0% and must not be miscounted as a loss.
          result: pnlPercentage >= 0 ? "WIN" : "LOSS",
          closedAt: new Date(),
          events: {
            create: {
              eventType: stopHit ? "STOP_LOSS_HIT" : "TP2_HIT",
              message: stopHit
                ? `${trailing ? "Trailing stop" : "Stop loss"} hit; filled ${exitPrice.toFixed(8)} (level ${stopLoss}, observed ${currentPrice}, slip ${slippageBps}bps)`
                : `Take profit 2 hit; filled ${exitPrice.toFixed(8)}`,
              price: exitPrice
            }
          }
        }
      });
      await logBot("info", stopHit ? (trailing ? "Papertrade trailing stop hit" : "Papertrade stop loss hit") : "Papertrade take profit 2 hit", {
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
          // Move stop to breakeven once TP1 is reached, then trailing arms on the
          // next cycles (see top of loop) at the entry-chosen ATR multiple.
          stopLoss: entry,
          events: {
            create: {
              eventType: "TP1_HIT",
              message: `Take profit 1 hit; stop to breakeven, trailing armed at ${Number(trade.trailAtrMultiple ?? config.TRAIL_CHOP_ATR_MULT)}x ATR`,
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
