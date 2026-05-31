import { Metric } from "../../components/Metric";
import { StatusPill } from "../../components/StatusPill";
import { getDashboardData } from "../../lib/dashboard";

export const dynamic = "force-dynamic";

function parseFrom(value: string | string[] | undefined): Date | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return undefined;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export default async function DashboardPage({ searchParams }: { searchParams?: { from?: string | string[] } }) {
  const from = parseFrom(searchParams?.from);
  const data = await getDashboardData({ from });
  const currentRun = data.runs.current;
  const previousRun = data.runs.previous;
  const fromValue = data.from ? data.from.toISOString().slice(0, 10) : "";

  return (
    <>
      <div className="page-title">
        <h1>Dashboard</h1>
        <StatusPill label={data.config.KILL_SWITCH ? "Trading paused" : "Paper trading active"} tone={data.config.KILL_SWITCH ? "bad" : "good"} />
      </div>

      <form className="panel" method="get" style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="cell-label">Show data from</span>
          <input type="date" name="from" defaultValue={fromValue} style={{ padding: "6px 8px" }} />
        </label>
        <button type="submit" style={{ padding: "7px 14px", borderRadius: 6, border: "1px solid var(--line)", background: "var(--shell)", color: "#ffffff", cursor: "pointer" }}>Apply</button>
        {fromValue ? (
          <a href="/dashboard" className="muted" style={{ alignSelf: "center" }}>Reset</a>
        ) : null}
        <span className="muted" style={{ alignSelf: "center" }}>
          {fromValue ? `Filtering trades & signals from ${data.from!.toLocaleDateString("nl-NL")} (all runs)` : "Showing all results across all runs"}
        </span>
      </form>
      {!currentRun ? <p className="muted">No active run is loaded yet. Start the worker after the new `.env` values are in place.</p> : null}

      <div className="grid">
        <Metric label="Active symbols" value={data.symbols.map((symbol) => symbol.symbol).join(", ") || "BTCUSDT"} />
        <Metric label="Trading mode" value={data.config.TRADING_MODE.toUpperCase()} />
        <Metric label="Live trading" value={data.config.ENABLE_LIVE_TRADING ? "Enabled" : "Disabled"} />
        <Metric label="Active run" value={currentRun ? currentRun.name : "No active run"} />
        <Metric label="Current trend" value={data.currentRegime ?? "Unknown"} />
        <Metric label="Open papertrades" value={data.openTrades.length} />
        <Metric label="Closed papertrades" value={data.closedTrades.length} />
        <Metric label="Skipped signals" value={data.skippedSignals} />
        <Metric label="Balance (€)" value={`€${data.balance.toFixed(2)}`} />
        <Metric label="Realized P/L (€)" value={`€${data.realizedPnlAmount.toFixed(2)}`} />
        <Metric label="Start balance (€)" value={`€${data.startBalance.toFixed(2)}`} />
        <Metric label="Winrate" value={`${data.winrate.toFixed(1)}%`} />
        <Metric label="P/L" value={`${data.pnl.toFixed(2)}%`} />
        <Metric label="Profit factor" value={data.profitFactor.toFixed(2)} />
        <Metric label="Average R/R" value={data.averageRiskReward.toFixed(2)} />
      </div>

      <section className="panel" style={{ marginTop: 18 }}>
        <h2>Risk status</h2>
        <p className="muted">
          Max risk per trade {data.config.MAX_RISK_PER_TRADE}%, max daily loss {data.config.MAX_DAILY_LOSS}%, max open trades{" "}
          {data.config.MAX_OPEN_TRADES}, min confidence score {data.config.MIN_CONFIDENCE_SCORE}.
        </p>
        <p>
          <StatusPill label="MEXC read-only data" tone="good" />{" "}
          <StatusPill label={data.config.TELEGRAM_BOT_TOKEN ? "Telegram configured" : "Telegram not configured"} tone={data.config.TELEGRAM_BOT_TOKEN ? "good" : "warn"} />
        </p>
      </section>

      <section className="panel" style={{ marginTop: 18 }}>
        <h2>Strategy comparison — Scalp vs Swing</h2>
        <p className="muted">Winrate and P/L per strategy. Same engine, different parameters.</p>
        <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Strategy</th>
              <th>Closed trades</th>
              <th>Winrate</th>
              <th>P/L %</th>
              <th>P/L (€)</th>
              <th>Profit factor</th>
            </tr>
          </thead>
          <tbody>
            {data.strategyComparison.length === 0 ? (
              <tr><td colSpan={6} className="muted">No closed trades yet for either strategy.</td></tr>
            ) : (
              data.strategyComparison.map((row) => (
                <tr key={row.strategy}>
                  <td data-label="Strategy"><span className="cell-label">Strategy</span>{row.strategy}</td>
                  <td data-label="Closed trades"><span className="cell-label">Closed trades</span>{row.trades}</td>
                  <td data-label="Winrate"><span className="cell-label">Winrate</span>{row.winrate.toFixed(1)}%</td>
                  <td data-label="P/L %"><span className="cell-label">P/L %</span>{row.pnl.toFixed(2)}%</td>
                  <td data-label="P/L (€)"><span className="cell-label">P/L (€)</span>€{row.pnlAmount.toFixed(2)}</td>
                  <td data-label="Profit factor"><span className="cell-label">Profit factor</span>{row.profitFactor.toFixed(2)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </section>

      <section className="panel" style={{ marginTop: 18 }}>
        <h2>Why signals are skipped</h2>
        <p className="muted">Grouped reasons across skipped signals. Risk caps usually dominate, not low score.</p>
        <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Reason</th>
              <th>Count</th>
              <th>Share</th>
            </tr>
          </thead>
          <tbody>
            {data.skipReasonGroups.length === 0 ? (
              <tr><td colSpan={3} className="muted">No skipped signals yet.</td></tr>
            ) : (
              (() => {
                const total = data.skipReasonGroups.reduce((sum, row) => sum + row.count, 0);
                return data.skipReasonGroups.map((row) => (
                  <tr key={row.bucket}>
                    <td data-label="Reason"><span className="cell-label">Reason</span>{row.bucket}</td>
                    <td data-label="Count"><span className="cell-label">Count</span>{row.count.toLocaleString()}</td>
                    <td data-label="Share"><span className="cell-label">Share</span>{total === 0 ? "0%" : `${((row.count / total) * 100).toFixed(0)}%`}</td>
                  </tr>
                ));
              })()
            )}
          </tbody>
        </table>
        </div>
      </section>

      <section className="panel" style={{ marginTop: 18 }}>
        <h2>Performance by trend</h2>
        <p className="muted">Which market regime (at entry) the bot trades best in. Sorted by P/L.</p>
        <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Trend</th>
              <th>Closed trades</th>
              <th>Winrate</th>
              <th>P/L</th>
              <th>Profit factor</th>
            </tr>
          </thead>
          <tbody>
            {data.regimeBreakdown.length === 0 ? (
              <tr><td colSpan={5} className="muted">No closed trades yet.</td></tr>
            ) : (
              data.regimeBreakdown.map((row) => (
                <tr key={row.regime}>
                  <td data-label="Trend"><span className="cell-label">Trend</span>{row.regime}</td>
                  <td data-label="Closed trades"><span className="cell-label">Closed trades</span>{row.trades}</td>
                  <td data-label="Winrate"><span className="cell-label">Winrate</span>{row.winrate.toFixed(1)}%</td>
                  <td data-label="P/L"><span className="cell-label">P/L</span>{row.pnl.toFixed(2)}%</td>
                  <td data-label="Profit factor"><span className="cell-label">Profit factor</span>{row.profitFactor.toFixed(2)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </section>

      <section className="panel" style={{ marginTop: 18 }}>
        <h2>Run comparison</h2>
        <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Run</th>
              <th>Started</th>
              <th>Symbols</th>
              <th>Min score</th>
              <th>No-sweep cap</th>
              <th>Signals</th>
              <th>Skipped</th>
              <th>Winrate</th>
              <th>P/L</th>
            </tr>
          </thead>
          <tbody>
            {[currentRun, previousRun].filter(Boolean).map((run) => (
              <tr key={run!.id}>
                <td data-label="Run"><span className="cell-label">Run</span>{run!.name}</td>
                <td data-label="Started"><span className="cell-label">Started</span>{run!.startedAt.toLocaleString("nl-NL")}</td>
                <td data-label="Symbols"><span className="cell-label">Symbols</span>{run!.snapshot.symbols.join(", ") || "BTCUSDT"}</td>
                <td data-label="Min score"><span className="cell-label">Min score</span>{run!.snapshot.minConfidenceScore}</td>
                <td data-label="No-sweep cap"><span className="cell-label">No-sweep cap</span>{run!.snapshot.maxScoreWithoutLiquiditySweep}</td>
                <td data-label="Signals"><span className="cell-label">Signals</span>{run!.signals}</td>
                <td data-label="Skipped"><span className="cell-label">Skipped</span>{run!.skippedSignals}</td>
                <td data-label="Winrate"><span className="cell-label">Winrate</span>{run!.winrate.toFixed(1)}%</td>
                <td data-label="P/L"><span className="cell-label">P/L</span>{run!.pnl.toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>

      <section className="panel" style={{ marginTop: 18 }}>
        <h2>Run context</h2>
        <p className="muted">
          The dashboard now reads the latest run separately from legacy pooled data. Old signals and trades stay in the database so parameter changes can be compared by run instead of overwritten.
        </p>
        {currentRun ? (
          <p className="muted">
            Current run {currentRun.name} started {currentRun.startedAt.toLocaleString("nl-NL")} with {currentRun.snapshot.symbols.join(", ") || "BTCUSDT"} and threshold {currentRun.snapshot.minConfidenceScore}.
          </p>
        ) : (
          <p className="muted">No run record exists yet. Start the worker once to create the first run snapshot.</p>
        )}
      </section>

      <section className="panel" style={{ marginTop: 18 }}>
        <h2>Latest signals</h2>
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
            </tr>
          </thead>
          <tbody>
            {data.signals.map((signal) => (
              <tr key={signal.id}>
                <td data-label="Created"><span className="cell-label">Created</span>{signal.createdAt.toLocaleString("nl-NL")}</td>
                <td data-label="Run"><span className="cell-label">Run</span>{signal.run?.name ?? "Legacy"}</td>
                <td data-label="Symbol"><span className="cell-label">Symbol</span>{signal.symbol}</td>
                <td data-label="TF"><span className="cell-label">TF</span>{signal.timeframe}</td>
                <td data-label="Direction"><span className="cell-label">Direction</span>{signal.direction}</td>
                <td data-label="Score"><span className="cell-label">Score</span>{signal.score}</td>
                <td data-label="Status"><span className="cell-label">Status</span>{signal.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>
    </>
  );
}
