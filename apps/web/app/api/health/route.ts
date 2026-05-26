import { NextResponse } from "next/server";
import { loadConfig } from "@tradeplatformcodex/shared";

export function GET() {
  const config = loadConfig();
  return NextResponse.json({
    status: "ok",
    app: config.APP_NAME,
    symbols: config.SYMBOLS,
    tradingMode: config.TRADING_MODE,
    liveTrading: config.ENABLE_LIVE_TRADING,
    killSwitch: config.KILL_SWITCH
  });
}
