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
                <td>{log.createdAt.toLocaleString("nl-NL")}</td>
                <td>{log.run?.name ?? "Legacy"}</td>
                <td>{log.level}</td>
                <td>{log.message}</td>
                <td>{log.context ? JSON.stringify(log.context) : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
