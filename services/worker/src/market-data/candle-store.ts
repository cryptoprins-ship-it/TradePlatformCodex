import type { Candle } from "@tradeplatformcodex/shared";
import { prisma } from "../db";

export async function ensureBtcSymbol(): Promise<void> {
  await prisma.symbol.upsert({
    where: { symbol: "BTCUSDT" },
    create: {
      symbol: "BTCUSDT",
      baseAsset: "BTC",
      quoteAsset: "USDT",
      riskClass: "CORE"
    },
    update: {
      isActive: true,
      riskClass: "CORE"
    }
  });
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

