# TradePlatformCodex

BTCUSDT-first crypto papertrading platform for MEXC market data. Phase 1A is deliberately limited to papertrading only:

- `SYMBOLS=BTCUSDT`
- `TRADING_MODE=paper`
- `ENABLE_LIVE_TRADING=false`
- no live order code
- no extra coins
- no secrets in Git

## Stack

- Next.js + TypeScript dashboard
- PostgreSQL + Prisma
- Redis for future queue/cache work
- MEXC public market data connector
- Worker cycle for candles, signals, papertrades, risk checks and Telegram alerts
- Docker Compose for local/VPS deployment

## Local Setup

```bash
npm install
cp .env.example .env
npm run prisma:generate
npm run build
npm run lint
```

Use a PostgreSQL database matching `DATABASE_URL` before running the dashboard or worker.

```bash
npm run dev
npm run worker
```

The dashboard runs at:

```txt
http://localhost:3000/dashboard
```

## Docker Compose

```bash
cp .env.example .env
docker compose config
docker compose up -d
docker compose logs -f
```

The `app` service exposes port `3000` for local use. PostgreSQL and Redis are internal services. The `worker` service runs the BTCUSDT papertrading cycle.

Create the database schema before first use:

```bash
docker compose run --rm app npx prisma db push
```

## VPS With Traefik

If Traefik already runs on the VPS, attach this stack to the Traefik Docker network:

```bash
cp .env.example .env
nano .env
docker network ls
TRAEFIK_HOST=tradingplatformcodex.mpsecurity.cloud docker compose -f docker-compose.yml -f docker-compose.traefik.yml config
TRAEFIK_HOST=tradingplatformcodex.mpsecurity.cloud docker compose -f docker-compose.yml -f docker-compose.traefik.yml up -d --build
docker compose run --rm app npx prisma db push
docker compose logs -f app worker
```

If your Traefik network or cert resolver has a different name, set these in `.env` or before the command:

```env
TRAEFIK_NETWORK=traefik
TRAEFIK_CERT_RESOLVER=letsencrypt
TRAEFIK_ENTRYPOINT=websecure
TRAEFIK_HOST=tradingplatformcodex.mpsecurity.cloud
```

Keep `TRADING_MODE=paper` and `ENABLE_LIVE_TRADING=false` on the VPS.

## Environment

Secrets belong only in `.env`, never in Git. `.env.example` contains empty placeholders for:

```env
MEXC_API_KEY=
MEXC_API_SECRET=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

MEXC API credentials are not required for phase 1A market data because the connector uses public read-only endpoints.

## Worker Flow

The worker performs one safe papertrading cycle:

1. Ensure `BTCUSDT` symbol exists.
2. Fetch MEXC candles for `5m`, `15m`, `1h`, and `4h`.
3. Store candles idempotently.
4. Generate LONG/SHORT signals for `5m` and `15m`.
5. Score EMA200, RSI, MACD, volume, wick/shakeout and multi-timeframe context.
6. Store every signal, including skipped signals.
7. Enforce risk checks before opening a papertrade.
8. Monitor open papertrades against current price.
9. Send Telegram alerts when configured.

## Risk Defaults

```env
MAX_RISK_PER_TRADE=1
MAX_DAILY_LOSS=3
MAX_OPEN_TRADES=1
MIN_CONFIDENCE_SCORE=75
MAX_TRADES_PER_DAY=3
KILL_SWITCH=false
```

If `KILL_SWITCH=true`, new papertrades are blocked and a bot log is created.

## VPS Notes

Recommended first deployment:

```bash
git clone <repo-url>
cd TradePlatformCodex
cp .env.example .env
docker compose up -d
docker compose logs -f
```

Before public exposure, put the dashboard behind Nginx, TLS and authentication. Keep MEXC keys read-only in phase 1A.
