import type { SupportedSymbol } from "../types/trading";

// Sector groups for the basket. One group per symbol — the single source of
// truth the dashboard uses to break performance down per sector. Keep this in
// sync with SUPPORTED_SYMBOLS (a test asserts every supported symbol is mapped).
export type CoinGroup =
  | "Layer 1"
  | "Layer 2"
  | "Interop / infra"
  | "DeFi"
  | "Staking"
  | "AI"
  | "Oracle"
  | "DePIN / storage"
  | "Modular / DA"
  | "Privacy"
  | "Identity"
  | "Payments / exchange"
  | "RWA / gold"
  | "NFT / consumer"
  | "Gaming"
  | "Meme"
  | "Messaging / TON";

export const SYMBOL_GROUPS: Record<SupportedSymbol, CoinGroup> = {
  BTCUSDT: "Layer 1",
  ETHUSDT: "Layer 1",
  SOLUSDT: "Layer 1",
  BERAUSDT: "Layer 1",
  AVAXUSDT: "Layer 1",
  NEARUSDT: "Layer 1",
  ICPUSDT: "Layer 1",
  ARBUSDT: "Layer 2",
  OPUSDT: "Layer 2",
  POLUSDT: "Layer 2",
  IMXUSDT: "Layer 2",
  STXUSDT: "Layer 2",
  INJUSDT: "Interop / infra",
  DOTUSDT: "Interop / infra",
  ATOMUSDT: "Interop / infra",
  ENSOUSDT: "Interop / infra",
  AAVEUSDT: "DeFi",
  UNIUSDT: "DeFi",
  JUPUSDT: "DeFi",
  PENDLEUSDT: "DeFi",
  ENAUSDT: "DeFi",
  LDOUSDT: "Staking",
  EIGENUSDT: "Staking",
  TAOUSDT: "AI",
  FETUSDT: "AI",
  LINKUSDT: "Oracle",
  PYTHUSDT: "Oracle",
  RENDERUSDT: "DePIN / storage",
  AKTUSDT: "DePIN / storage",
  FILUSDT: "DePIN / storage",
  ARUSDT: "DePIN / storage",
  GRTUSDT: "DePIN / storage",
  TIAUSDT: "Modular / DA",
  DYMUSDT: "Modular / DA",
  ZECUSDT: "Privacy",
  ROSEUSDT: "Privacy",
  WLDUSDT: "Identity",
  XRPUSDT: "Payments / exchange",
  BNBUSDT: "Payments / exchange",
  ONDOUSDT: "RWA / gold",
  PAXGUSDT: "RWA / gold",
  XAUTUSDT: "RWA / gold",
  PENGUUSDT: "NFT / consumer",
  AXSUSDT: "Gaming",
  DOGEUSDT: "Meme",
  TONUSDT: "Messaging / TON",
  NOTUSDT: "Messaging / TON"
};

// Resolve a symbol's group, tolerating unknown/legacy symbols (returns "Other").
export function getSymbolGroup(symbol: string): CoinGroup | "Other" {
  return SYMBOL_GROUPS[symbol as SupportedSymbol] ?? "Other";
}
