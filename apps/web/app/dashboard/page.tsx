import { Metric } from "../../components/Metric";
import { StatusPill } from "../../components/StatusPill";
import { getDashboardData } from "../../lib/dashboard";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const data = await getDashboardData();

  return (
    <>
      <div className="page-title">
        <h1>Dashboard</h1>
        <StatusPill label={data.config.KILL_SWITCH ? "Trading paused" : "Paper trading active"} tone={data.config.KILL_SWITCH ? "bad" : "good"} />
      </div>

      <div className="grid">
        <Metric label="Active symbols" value={data.symbols.map((symbol) => symbol.symbol).join(", ") || "BTCUSDT"} />
        <Metric label="Trading mode" value={data.config.TRADING_MODE.toUpperCase()} />
        <Metric label="Live trading" value={data.config.ENABLE_LIVE_TRADING ? "Enabled" : "Disabled"} />
        <Metric label="Open papertrades" value={data.openTrades.length} />
        <Metric label="Closed papertrades" value={data.closedTrades.length} />
        <Metric label="Skipped signals" value={data.skippedSignals} />
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
        <h2>Latest signals</h2>
        <table>
          <thead>
            <tr>
              <th>Created</th>
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
                <td>{signal.createdAt.toLocaleString("nl-NL")}</td>
                <td>{signal.symbol}</td>
                <td>{signal.timeframe}</td>
                <td>{signal.direction}</td>
                <td>{signal.score}</td>
                <td>{signal.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
