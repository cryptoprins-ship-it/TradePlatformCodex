import type { Candle, SupportedSymbol } from "@tradeplatformcodex/shared";
import { prisma } from "../db";

function symbolMeta(symbol: SupportedSymbol): { baseAsset: string; quoteAsset: string; riskClass: string } {
  const baseAsset = symbol.replace(/USDT$/, "");
  const coreSymbols: SupportedSymbol[] = ["BTCUSDT", "ETHUSDT"];
  return {
    baseAsset,
    quoteAsset: "USDT",
    riskClass: coreSymbols.includes(symbol) ? "CORE" : "ALT"
  };
}

export async function ensureSymbols(symbols: SupportedSymbol[]): Promise<void> {
  for (const symbol of symbols) {
    const meta = symbolMeta(symbol);
    await prisma.symbol.upsert({
      where: { symbol },
      create: {
        symbol,
        baseAsset: meta.baseAsset,
        quoteAsset: meta.quoteAsset,
        riskClass: meta.riskClass
      },
      update: {
        isActive: true,
        riskClass: meta.riskClass
      }
    });
  }
}

export async function storeCandles(candles: Candle[]): Promise<void> {
  for (const candle of candles) {
    await prisma.candle.upsert({
      where: {
        symbol_timeframe_openTime: {
          symbol: candle.symbol,
          timeframe: candle.timeframe,
          openTime: candle.openTime
        }
      },
      create: candle,
      update: {
        closeTime: candle.closeTime,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume
      }
    });
  }
}
