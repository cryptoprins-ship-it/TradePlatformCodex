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

export default async function PapertradesPage() {
  const trades = await prisma.trade.findMany({
    include: { events: { orderBy: { createdAt: "desc" }, take: 3 }, run: { select: { name: true, configHash: true } } },
    orderBy: { openedAt: "desc" },
    take: 50
  });

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
              <th>Status</th>
              <th>P/L</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade) => (
              <tr key={trade.id}>
                <td data-label="Opened"><span className="cell-label">Opened</span>{trade.openedAt.toLocaleString("nl-NL")}</td>
                <td data-label="Run"><span className="cell-label">Run</span>{trade.run?.name ?? "Legacy"}</td>
                <td data-label="Symbol"><span className="cell-label">Symbol</span>{trade.symbol}</td>
                <td data-label="TF"><span className="cell-label">TF</span>{trade.timeframe}</td>
                <td data-label="Direction"><span className="cell-label">Direction</span>{trade.direction}</td>
                <td data-label="Entry"><span className="cell-label">Entry</span>{fmtPrice(Number(trade.entryPrice))}</td>
                <td data-label="SL"><span className="cell-label">SL</span>{fmtPrice(Number(trade.stopLoss))}</td>
                <td data-label="TP1"><span className="cell-label">TP1</span>{fmtPrice(Number(trade.takeProfit1))}</td>
                <td data-label="TP2"><span className="cell-label">TP2</span>{fmtPrice(Number(trade.takeProfit2))}</td>
                <td data-label="Status"><span className="cell-label">Status</span>{trade.status}</td>
                <td data-label="P/L"><span className="cell-label">P/L</span>{trade.pnlPercentage ? `${Number(trade.pnlPercentage).toFixed(2)}%` : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>
    </>
  );
}
