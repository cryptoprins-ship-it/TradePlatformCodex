import type { SupportedSymbol } from "../types/trading";

// Sector groups for the basket. One group per symbol — the single source of
// truth the dashboard uses to break performance down per sector. Keep this in
// sync with SUPPORTED_SYMBOLS (a test asserts every supported symbol is mapped).
export type CoinGroup =
  | "Layer 0"
  | "Layer 1 — majors"
  | "Layer 1 — niche"
  | "Layer 2"
  | "DeFi — lending / DEX"
  | "DeFi — yield / staking"
  | "Derivatives"
  | "Stablecoin / CDP"
  | "Cross-chain"
  | "Media"
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
  BTCUSDT: "Layer 1 — majors",
  ETHUSDT: "Layer 1 — majors",
  SOLUSDT: "Layer 1 — majors",
  AVAXUSDT: "Layer 1 — majors",
  NEARUSDT: "Layer 1 — majors",
  BERAUSDT: "Layer 1 — niche",
  ICPUSDT: "Layer 1 — niche",
  ARBUSDT: "Layer 2",
  OPUSDT: "Layer 2",
  POLUSDT: "Layer 2",
  IMXUSDT: "Layer 2",
  STXUSDT: "Layer 2",
  DOTUSDT: "Layer 0",
  ATOMUSDT: "Layer 0",
  INJUSDT: "Layer 1 — niche",
  AAVEUSDT: "DeFi — lending / DEX",
  UNIUSDT: "DeFi — lending / DEX",
  JUPUSDT: "DeFi — lending / DEX",
  ENSOUSDT: "DeFi — lending / DEX",
  PENDLEUSDT: "DeFi — yield / staking",
  ENAUSDT: "DeFi — yield / staking",
  LDOUSDT: "DeFi — yield / staking",
  EIGENUSDT: "DeFi — yield / staking",
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
  NOTUSDT: "Messaging / TON",
  HBARUSDT: "Layer 1 — niche",
  THETAUSDT: "Media",
  AUDIOUSDT: "Media",
  HYPEUSDT: "Derivatives",
  SNXUSDT: "Derivatives",
  DYDXUSDT: "Derivatives",
  RUNEUSDT: "Cross-chain",
  AXLUSDT: "Cross-chain",
  MKRUSDT: "Stablecoin / CDP",
  SKYUSDT: "Stablecoin / CDP",
  ENSUSDT: "Identity",
  BLURUSDT: "NFT / consumer",
  SANDUSDT: "Gaming",
  GALAUSDT: "Gaming",
  SHIBUSDT: "Meme",
  PEPEUSDT: "Meme",
  WIFUSDT: "Meme",
  APEUSDT: "NFT / consumer"
};

// Resolve a symbol's group, tolerating unknown/legacy symbols (returns "Other").
export function getSymbolGroup(symbol: string): CoinGroup | "Other" {
  return SYMBOL_GROUPS[symbol as SupportedSymbol] ?? "Other";
}
