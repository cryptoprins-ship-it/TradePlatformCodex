export type Timeframe = "5m" | "15m" | "1h" | "4h" | "1d";
export type Direction = "LONG" | "SHORT";
export type SignalStatus = "DETECTED" | "TRADE_OPENED" | "SKIPPED";
export type TradeStatus = "OPEN" | "TP1_HIT" | "TP2_HIT" | "STOP_LOSS_HIT" | "CLOSED" | "CANCELLED" | "SKIPPED";
export type SupportedSymbol =
  | "BTCUSDT"
  | "ETHUSDT"
  | "SOLUSDT"
  | "XRPUSDT"
  | "WLDUSDT"
  | "ZECUSDT"
  | "INJUSDT"
  | "BERAUSDT"
  | "ENSOUSDT"
  | "ONDOUSDT"
  | "AXSUSDT"
  | "PENGUUSDT"
  | "TAOUSDT"
  | "FETUSDT"
  | "BNBUSDT"
  | "DOGEUSDT"
  | "AAVEUSDT"
  | "PAXGUSDT"
  | "XAUTUSDT"
  | "LINKUSDT"
  | "PYTHUSDT"
  | "ARBUSDT"
  | "OPUSDT"
  | "RENDERUSDT"
  | "AKTUSDT"
  | "LDOUSDT"
  | "EIGENUSDT"
  | "TIAUSDT"
  | "DYMUSDT"
  | "UNIUSDT"
  | "JUPUSDT"
  | "FILUSDT"
  | "ARUSDT"
  | "TONUSDT"
  | "NOTUSDT"
  | "ICPUSDT"
  | "NEARUSDT"
  | "DOTUSDT"
  | "AVAXUSDT"
  | "ATOMUSDT"
  | "GRTUSDT"
  | "STXUSDT"
  | "IMXUSDT"
  | "POLUSDT"
  | "ROSEUSDT"
  | "ENAUSDT"
  | "PENDLEUSDT"
  | "HBARUSDT"
  | "THETAUSDT"
  | "AUDIOUSDT"
  | "HYPEUSDT"
  | "SNXUSDT"
  | "DYDXUSDT"
  | "RUNEUSDT"
  | "AXLUSDT"
  | "MKRUSDT"
  | "SKYUSDT"
  | "ENSUSDT"
  | "BLURUSDT"
  | "SANDUSDT"
  | "GALAUSDT"
  | "SHIBUSDT"
  | "PEPEUSDT"
  | "WIFUSDT"
  | "APEUSDT";

export interface Candle {
  symbol: SupportedSymbol;
  timeframe: Timeframe;
  openTime: Date;
  closeTime: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ModuleScore {
  module: string;
  score: number;
  reason: string;
}

export interface TradingSignal {
  symbol: SupportedSymbol;
  timeframe: Timeframe;
  direction: Direction;
  score: number;
  reason: string;
  moduleScores: ModuleScore[];
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  trailAtrMultiple: number;
  entryRegime: string;
}

export interface PaperTradeInput extends TradingSignal {
  signalId: string;
}

export interface RiskSnapshot {
  allowed: boolean;
  reasons: string[];
}
