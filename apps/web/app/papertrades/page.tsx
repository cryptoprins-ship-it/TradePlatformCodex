import { prisma } from "../../lib/prisma";

export const dynamic = "force-dynamic";

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
                <td data-label="Entry"><span className="cell-label">Entry</span>{Number(trade.entryPrice).toFixed(2)}</td>
                <td data-label="SL"><span className="cell-label">SL</span>{Number(trade.stopLoss).toFixed(2)}</td>
                <td data-label="TP1"><span className="cell-label">TP1</span>{Number(trade.takeProfit1).toFixed(2)}</td>
                <td data-label="TP2"><span className="cell-label">TP2</span>{Number(trade.takeProfit2).toFixed(2)}</td>
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
