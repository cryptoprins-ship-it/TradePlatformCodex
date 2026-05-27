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
                <td>{signal.createdAt.toLocaleString("nl-NL")}</td>
                <td>{signal.run?.name ?? "Legacy"}</td>
                <td>{signal.symbol}</td>
                <td>{signal.timeframe}</td>
                <td>{signal.direction}</td>
                <td>{signal.score}</td>
                <td>{signal.status}</td>
                <td>{signal.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
