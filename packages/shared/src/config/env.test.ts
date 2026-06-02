import { describe, expect, it } from "vitest";
import { loadConfig } from "./env";

describe("loadConfig", () => {
  it("allows BTCUSDT papertrading defaults", () => {
    const config = loadConfig({
      ENABLE_LIVE_TRADING: "false",
      SYMBOLS: "BTCUSDT"
    });

    expect(config.TRADING_MODE).toBe("paper");
    expect(config.ENABLE_LIVE_TRADING).toBe(false);
    expect(config.SYMBOLS).toEqual(["BTCUSDT"]);
    expect(config.MARKOV_REGIME_ENABLED).toBe(true);
    expect(config.MARKOV_REGIME_PENALTY).toBe(25);
  });

  it("allows configured multi-symbol papertrading list", () => {
    const config = loadConfig({
      ENABLE_LIVE_TRADING: "false",
      SYMBOLS: "BTCUSDT,ETHUSDT,SOLUSDT,XRPUSDT,WLDUSDT"
    });

    expect(config.SYMBOLS).toEqual(["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "WLDUSDT"]);
  });

  it("accepts the full sector basket", () => {
    const config = loadConfig({
      ENABLE_LIVE_TRADING: "false",
      SYMBOLS: "BTCUSDT,BNBUSDT,DOGEUSDT,ZECUSDT,TAOUSDT,FETUSDT,ONDOUSDT,AAVEUSDT,INJUSDT,AXSUSDT,BERAUSDT,ENSOUSDT,PENGUUSDT,PAXGUSDT,XAUTUSDT"
    });

    expect(config.SYMBOLS).toContain("AAVEUSDT");
    expect(config.SYMBOLS).toContain("PENGUUSDT");
    expect(config.SYMBOLS).toContain("PAXGUSDT");
    expect(config.SYMBOLS).toContain("XAUTUSDT");
  });

  it("rejects unsupported symbols", () => {
    expect(() =>
      loadConfig({
        ENABLE_LIVE_TRADING: "false",
        SYMBOLS: "BTCUSDT,FAKEUSDT"
      })
    ).toThrow();
  });

  it("rejects live trading", () => {
    expect(() =>
      loadConfig({
        ENABLE_LIVE_TRADING: "true",
        SYMBOLS: "BTCUSDT"
      })
    ).toThrow();
  });
});
