import { loadConfig } from "@tradeplatformcodex/shared";
import { StatusPill } from "../../components/StatusPill";

export default function SettingsPage() {
  const config = loadConfig();
  const rows = [
    ["APP_NAME", config.APP_NAME],
    ["TRADING_MODE", config.TRADING_MODE],
    ["ENABLE_LIVE_TRADING", String(config.ENABLE_LIVE_TRADING)],
    ["EXCHANGE", config.EXCHANGE],
    ["SYMBOLS", config.SYMBOLS.join(",")],
    ["TIMEFRAMES", config.TIMEFRAMES.join(",")],
    ["MAX_RISK_PER_TRADE", `${config.MAX_RISK_PER_TRADE}%`],
    ["MAX_DAILY_LOSS", `${config.MAX_DAILY_LOSS}%`],
    ["MAX_OPEN_TRADES", String(config.MAX_OPEN_TRADES)],
    ["MIN_CONFIDENCE_SCORE", String(config.MIN_CONFIDENCE_SCORE)],
    ["MAX_TRADES_PER_DAY", String(config.MAX_TRADES_PER_DAY)],
    ["KILL_SWITCH", String(config.KILL_SWITCH)]
  ];

  return (
    <>
      <div className="page-title">
        <h1>Settings</h1>
        <StatusPill label="Secrets hidden" tone="good" />
      </div>
      <section className="panel">
        <table>
          <thead>
            <tr>
              <th>Key</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([key, value]) => (
              <tr key={key}>
                <td>{key}</td>
                <td>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

