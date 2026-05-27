import { prisma } from "../../lib/prisma";

export const dynamic = "force-dynamic";

export default async function LogsPage() {
  const logs = await prisma.botLog.findMany({ include: { run: { select: { name: true, configHash: true } } }, orderBy: { createdAt: "desc" }, take: 100 });

  return (
    <>
      <div className="page-title">
        <h1>Logs</h1>
      </div>
      <section className="panel">
        <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Created</th>
              <th>Run</th>
              <th>Level</th>
              <th>Message</th>
              <th>Context</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td data-label="Created"><span className="cell-label">Created</span>{log.createdAt.toLocaleString("nl-NL")}</td>
                <td data-label="Run"><span className="cell-label">Run</span>{log.run?.name ?? "Legacy"}</td>
                <td data-label="Level"><span className="cell-label">Level</span>{log.level}</td>
                <td data-label="Message"><span className="cell-label">Message</span>{log.message}</td>
                <td data-label="Context"><span className="cell-label">Context</span>{log.context ? JSON.stringify(log.context) : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>
    </>
  );
}
