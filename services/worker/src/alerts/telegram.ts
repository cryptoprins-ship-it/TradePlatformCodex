import { type AppConfig, type TradingSignal } from "@tradeplatformcodex/shared";
import { logBot } from "../logging/bot-log";

function configured(config: AppConfig): boolean {
  return Boolean(config.BOT_ENABLED && config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID);
}

export async function sendTelegram(config: AppConfig, message: string): Promise<void> {
  if (!configured(config)) {
    return;
  }
  const response = await fetch(`https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: config.TELEGRAM_CHAT_ID,
      text: message,
      disable_web_page_preview: true
    })
  });
  if (!response.ok) {
    await logBot("warn", "Telegram alert failed", { status: response.status });
  }
}

export function formatSignalAlert(signal: TradingSignal): string {
  return [
    `${signal.symbol} ${signal.direction} signal`,
    `Score: ${signal.score}`,
    `Entry: ${signal.entryPrice}`,
    `SL: ${signal.stopLoss}`,
    `TP1: ${signal.takeProfit1}`,
    `TP2: ${signal.takeProfit2}`,
    `Reason: ${signal.reason}`,
    "Mode: PAPER"
  ].join("\n");
}

