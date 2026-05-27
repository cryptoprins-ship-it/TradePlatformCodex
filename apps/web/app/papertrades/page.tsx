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
                <td>{trade.openedAt.toLocaleString("nl-NL")}</td>
                <td>{trade.run?.name ?? "Legacy"}</td>
                <td>{trade.symbol}</td>
                <td>{trade.timeframe}</td>
                <td>{trade.direction}</td>
                <td>{Number(trade.entryPrice).toFixed(2)}</td>
                <td>{Number(trade.stopLoss).toFixed(2)}</td>
                <td>{Number(trade.takeProfit1).toFixed(2)}</td>
                <td>{Number(trade.takeProfit2).toFixed(2)}</td>
                <td>{trade.status}</td>
                <td>{trade.pnlPercentage ? `${Number(trade.pnlPercentage).toFixed(2)}%` : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
