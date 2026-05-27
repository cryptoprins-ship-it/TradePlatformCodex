import { prisma } from "../../lib/prisma";

export const dynamic = "force-dynamic";

export default async function SignalsPage() {
  const signals = await prisma.signal.findMany({
    include: { strategyScores: true, run: { select: { name: true, configHash: true } } },
    orderBy: { createdAt: "desc" },
    take: 50
  });

  return (
    <>
      <div className="page-title">
        <h1>Signals</h1>
      </div>
      <section className="panel">
        <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Created</th>
              <th>Run</th>
              <th>Symbol</th>
              <th>TF</th>
              <th>Direction</th>
              <th>Score</th>
              <th>Status</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {signals.map((signal) => (
              <tr key={signal.id}>
                <td data-label="Created"><span className="cell-label">Created</span>{signal.createdAt.toLocaleString("nl-NL")}</td>
                <td data-label="Run"><span className="cell-label">Run</span>{signal.run?.name ?? "Legacy"}</td>
                <td data-label="Symbol"><span className="cell-label">Symbol</span>{signal.symbol}</td>
                <td data-label="TF"><span className="cell-label">TF</span>{signal.timeframe}</td>
                <td data-label="Direction"><span className="cell-label">Direction</span>{signal.direction}</td>
                <td data-label="Score"><span className="cell-label">Score</span>{signal.score}</td>
                <td data-label="Status"><span className="cell-label">Status</span>{signal.status}</td>
                <td data-label="Reason"><span className="cell-label">Reason</span>{signal.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>
    </>
  );
}
