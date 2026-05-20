import type { Candle, Timeframe } from "@tradeplatformcodex/shared";

const MEXC_BASE_URL = "https://api.mexc.com";
const INTERVAL_MAP: Record<Timeframe, string> = {
  "5m": "5m",
  "15m": "15m",
  "1h": "60m",
  "4h": "4h"
};

type MEXCKline = [
  number,
  string,
  string,
  string,
  string,
  string,
  number,
  string
];

export class MEXCMarketDataClient {
  async getCandles(symbol: "BTCUSDT", timeframe: Timeframe, limit = 250): Promise<Candle[]> {
    const params = new URLSearchParams({
      symbol,
      interval: INTERVAL_MAP[timeframe],
      limit: String(limit)
    });
    const response = await fetch(`${MEXC_BASE_URL}/api/v3/klines?${params.toString()}`, {
      headers: { "user-agent": "TradePlatformCodex/0.1 papertrading" }
    });

    if (!response.ok) {
      throw new Error(`MEXC candle request failed with HTTP ${response.status}`);
    }

    const data = (await response.json()) as MEXCKline[];
    return data.map((item) => ({
      symbol,
      timeframe,
      openTime: new Date(item[0]),
      open: Number(item[1]),
      high: Number(item[2]),
      low: Number(item[3]),
      close: Number(item[4]),
      volume: Number(item[5]),
      closeTime: new Date(item[6])
    }));
  }

  async getTickerPrice(symbol: "BTCUSDT"): Promise<number> {
    const params = new URLSearchParams({ symbol });
    const response = await fetch(`${MEXC_BASE_URL}/api/v3/ticker/price?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`MEXC ticker request failed with HTTP ${response.status}`);
    }
    const data = (await response.json()) as { price: string };
    return Number(data.price);
  }
}

