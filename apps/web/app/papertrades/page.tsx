import { prisma } from "../../lib/prisma";

export const dynamic = "force-dynamic";

// Magnitude-aware price format: 2 decimals for big coins (BTC), more for cheap
// ones (XRP, PENGU) so entry/SL/TP don't collapse to the same rounded value.
function fmtPrice(value: number): string {
  if (value >= 100) return value.toFixed(2);
  if (value >= 1) return value.toFixed(4);
  if (value >= 0.01) return value.toFixed(5);
  return value.toFixed(8);
}

const POS = "#3fb950";
const NEG = "#f85149";

// Live spot prices from MEXC (public, no key) for the trade symbols.
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

export default async function PapertradesPage() {
  const trades = await prisma.trade.findMany({
    include: { events: { orderBy: { createdAt: "desc" }, take: 3 }, run: { select: { name: true, configHash: true } } },
    orderBy: { openedAt: "desc" },
    take: 50
  });
  const priceMap = await fetchPrices(Array.from(new Set(trades.map((trade) => trade.symbol))));

  return (
    <>
      <div className="page-title">
        <h1>Papertrades</h1>
      </div>
      <section className="panel">
        <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Opened</th>
              <th>Run</th>
              <th>Symbol</th>
              <th>TF</th>
              <th>Direction</th>
              <th>Entry</th>
              <th>SL</th>
              <th>TP1</th>
              <th>TP2</th>
              <th>Now</th>
              <th>Status</th>
              <th>P/L</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade) => {
              const isOpen = trade.status === "OPEN" || trade.status === "TP1_HIT";
              const current = priceMap.get(trade.symbol) ?? null;
              const entry = Number(trade.entryPrice);
              const unrealized =
                isOpen && current !== null && entry > 0
                  ? ((current - entry) / entry) * 100 * (trade.direction === "LONG" ? 1 : -1)
                  : null;
              const realized = trade.pnlPercentage !== null && trade.pnlPercentage !== undefined ? Number(trade.pnlPercentage) : null;
              const pnl = isOpen ? unrealized : realized;
              const pnlColor = pnl === null || pnl === 0 ? "inherit" : pnl > 0 ? POS : NEG;
              return (
              <tr key={trade.id}>
                <td data-label="Opened"><span className="cell-label">Opened</span>{trade.openedAt.toLocaleString("nl-NL")}</td>
                <td data-label="Run"><span className="cell-label">Run</span>{trade.run?.name ?? "Legacy"}</td>
                <td data-label="Symbol"><span className="cell-label">Symbol</span>{trade.symbol}</td>
                <td data-label="TF"><span className="cell-label">TF</span>{trade.timeframe}</td>
                <td data-label="Direction"><span className="cell-label">Direction</span>{trade.direction}</td>
                <td data-label="Entry"><span className="cell-label">Entry</span>{fmtPrice(entry)}</td>
                <td data-label="SL"><span className="cell-label">SL</span>{fmtPrice(Number(trade.stopLoss))}</td>
                <td data-label="TP1"><span className="cell-label">TP1</span>{fmtPrice(Number(trade.takeProfit1))}</td>
                <td data-label="TP2"><span className="cell-label">TP2</span>{fmtPrice(Number(trade.takeProfit2))}</td>
                <td data-label="Now"><span className="cell-label">Now</span>{current === null ? "—" : fmtPrice(current)}</td>
                <td data-label="Status"><span className="cell-label">Status</span>{trade.status}</td>
                <td data-label="P/L"><span className="cell-label">P/L</span>
                  <span style={{ color: pnlColor, fontWeight: 600 }}>
                    {pnl === null ? "-" : `${pnl > 0 ? "+" : ""}${pnl.toFixed(2)}%${isOpen ? " ·live" : ""}`}
                  </span>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </section>
    </>
  );
}
