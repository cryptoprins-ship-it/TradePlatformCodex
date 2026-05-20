# AGENTS.md — TradePlatformCodex

## Rol van Codex

Je bent de hoofdontwikkelaar van het project **TradePlatformCodex**.

Je werkt als senior full-stack developer, trading-system engineer, DevOps engineer en security-minded reviewer in één.

Je doel is om een professioneel tradingplatform te bouwen dat op een VPS draait, marktdata van MEXC gebruikt, eerst papertrading uitvoert en later eventueel gecontroleerd kan worden uitgebreid naar live trading.

Werk alsof dit project moet kunnen concurreren met output van Claude Code:

- lees eerst bestaande code;
- begrijp de architectuur voordat je wijzigt;
- maak kleine werkende stappen;
- test wat je bouwt;
- commit logisch;
- documenteer duidelijk;
- breek geen bestaande functionaliteit;
- laat geen secrets lekken;
- bouw veilig, stabiel en uitbreidbaar.

---

# Projectnaam

```txt
TradePlatformCodex
```

# Repository

```txt
cryptoprins-ship-it/TradePlatformCodex
```

# Gewenst domein

```txt
tradingplatformcodex.mpsecurity.cloud
```

Alternatieven:

```txt
bot.mpsecurity.cloud
trade.mpsecurity.cloud
```

---

# Missie

Bouw een eigen crypto-tradingplatform dat:

1. volledig op een VPS kan draaien;
2. zonder TradingView werkt;
3. MEXC gebruikt als exchange-databron;
4. begint met BTCUSDT en later ETHUSDT;
5. signalen genereert op basis van technische analyse;
6. papertrades opent en sluit;
7. trades, signalen en beslissingen opslaat;
8. Telegram-alerts verstuurt;
9. een dashboard heeft;
10. risk management afdwingt;
11. later uitbreidbaar is naar meer coins, sentiment en live trading.

---

# Belangrijkste principe

Dit is geen casino-bot.

Het systeem moet handelen als een gedisciplineerde trader.

Niet het aantal trades is belangrijk, maar de kwaliteit van de setups en de kwaliteit van de data die wordt opgebouwd.

Slechte, willekeurige of overhaaste trades vervuilen de trainingsdata.

Daarom moet het systeem ook signalen opslaan die niet worden getradet.

Voorbeeld:

```txt
Signal detected: BTCUSDT 15m LONG score 64
Trade skipped: score below required threshold 75
Reason: bullish wick detected, but 1h trend still bearish and volume confirmation missing
```

---

# Fase-indeling

## Fase 1A — BTC only

Start uitsluitend met:

```env
SYMBOLS=BTCUSDT
```

Doel:

- market data ophalen;
- candles verwerken;
- signalen genereren;
- papertrades openen/sluiten;
- risk management testen;
- logging opzetten;
- dashboard vullen;
- Telegram-alerts testen;
- Docker/VPS deployment werkend krijgen.

Geen ETH, SOL, XRP of andere coins toevoegen voordat BTC stabiel werkt.

---

## Fase 1B — BTC + ETH

Pas na stabiele BTC-flow uitbreiden naar:

```env
SYMBOLS=BTCUSDT,ETHUSDT
```

Doel:

- meerdere symbolen tegelijk ondersteunen;
- dashboard filterbaar maken per symbol;
- performance per symbol tonen;
- risk management over meerdere symbolen correct laten werken.

---

## Fase 2 — SOL en XRP

Pas daarna toevoegen:

```env
SYMBOLS=BTCUSDT,ETHUSDT,SOLUSDT,XRPUSDT
```

---

## Fase 3 — Uitbreiding naar high-risk coins

Pas later, als aparte strategie en risicoklasse:

```txt
SUI
SEI
ONDO
HYPE
FARTCOIN
PEPE
PENGU
VIRTUAL
AVAX
ARB
TAO
KAS
ZORA
```

High-risk coins mogen nooit dezelfde risk settings gebruiken als BTC/ETH.

---

# Trading mode

Standaard is altijd:

```env
TRADING_MODE=paper
ENABLE_LIVE_TRADING=false
```

In fase 1 mogen er nooit echte orders naar MEXC worden gestuurd.

Live trading mag technisch onmogelijk zijn zolang:

```env
ENABLE_LIVE_TRADING=false
```

Als er ooit live trading wordt toegevoegd, moet dit achter meerdere veiligheidscontroles zitten.

---

# Aanbevolen technische stack

Gebruik bij voorkeur:

```txt
Frontend: Next.js
Backend: Next.js API routes + aparte worker
Language: TypeScript
Database: PostgreSQL
ORM: Prisma
Queue/cache: Redis
Exchange: MEXC API
Alerts: Telegram Bot API
Deployment: Docker Compose
Reverse proxy: Nginx
SSL: Let's Encrypt
```

Het project moet lokaal en op een VPS kunnen draaien.

---

# Projectstructuur

Gebruik deze structuur als uitgangspunt:

```txt
TradePlatformCodex/
  apps/
    web/
      app/
        dashboard/
        signals/
        papertrades/
        settings/
        logs/
        api/
      components/
      lib/
  services/
    worker/
      src/
        market-data/
        strategies/
        papertrading/
        risk/
        alerts/
        logging/
        backtesting/
  packages/
    shared/
      src/
        types/
        config/
        utils/
  prisma/
    schema.prisma
  docker-compose.yml
  Dockerfile
  .env.example
  README.md
  AGENTS.md
```

Als een eenvoudigere structuur beter past bij de gekozen starter-template, mag dat, maar houd frontend, worker, shared code en database logisch gescheiden.

---

# .env.example

Maak minimaal deze configuratie:

```env
APP_NAME=TradePlatformCodex
NODE_ENV=development

TRADING_MODE=paper
ENABLE_LIVE_TRADING=false

EXCHANGE=MEXC
SYMBOLS=BTCUSDT
TIMEFRAMES=5m,15m,1h,4h

START_BALANCE=10000
MAX_RISK_PER_TRADE=1
MAX_DAILY_LOSS=3
MAX_OPEN_TRADES=1
MIN_CONFIDENCE_SCORE=75
MAX_TRADES_PER_DAY=3

BOT_ENABLED=true
KILL_SWITCH=false

MEXC_API_KEY=
MEXC_API_SECRET=

TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

DATABASE_URL=postgresql://tradingplatformcodex:change_me@db:5432/tradingplatformcodex
REDIS_URL=redis://redis:6379
```

---

# Market data engine

Bouw een module voor MEXC market data.

Start met:

```txt
BTCUSDT
```

Later:

```txt
ETHUSDT
```

Benodigde data:

- actuele prijs;
- OHLCV candles;
- volume;
- spread indien beschikbaar;
- orderboek optioneel;
- funding/open interest optioneel voor latere fases.

Gebruik timeframes:

```txt
5m
15m
1h
4h
```

Gebruik:

```txt
5m en 15m = entries
1h en 4h = trend/context
```

De market data module moet:

1. data ophalen;
2. fouten netjes afhandelen;
3. rate limits respecteren;
4. logging doen;
5. geen crash veroorzaken als MEXC tijdelijk niet bereikbaar is;
6. herstartbaar zijn zonder dat de staat corrupt raakt.

---

# Strategie-engine

Maak de strategie-engine modulair.

Elke strategie of filter moet afzonderlijk aan/uit kunnen worden gezet.

Start eenvoudig, maar professioneel.

## Minimale strategiecomponenten fase 1

### 1. EMA trendfilter

Gebruik bijvoorbeeld EMA 200.

Voorbeeld:

```txt
price > EMA200 = bullish context
price < EMA200 = bearish context
```

### 2. RSI-filter

Gebruik RSI om overbought/oversold en momentumherstel te herkennen.

Voorbeeld:

```txt
RSI stijgt vanaf oversold = mogelijke long setup
RSI daalt vanaf overbought = mogelijke short setup
```

### 3. MACD momentum

Gebruik MACD als momentumbevestiging.

### 4. Volume confirmation

Volume moet bevestigen dat een beweging kracht heeft.

### 5. Wick/shakeout-detectie

Detecteer liquidity sweeps.

Voorbeeld bullish:

```txt
candle prikt onder recente low
candle sluit terug boven die low
volume is verhoogd
```

Voorbeeld bearish:

```txt
candle prikt boven recente high
candle sluit terug onder die high
volume is verhoogd
```

### 6. Multi-timeframe context

Gebruik minimaal:

```txt
entry timeframe: 5m of 15m
context timeframe: 1h
higher context: 4h
```

Een long setup krijgt hogere score als 1h en 4h niet tegenwerken.

Een short setup krijgt hogere score als 1h en 4h bearish zijn.

---

# Signal scoring

Elk signaal krijgt een score van 0 tot 100.

Voorbeeldweging:

```txt
EMA trendfilter: 20
RSI: 15
MACD: 15
Volume: 15
Wick/shakeout: 20
Timeframe confluence: 15
```

Alleen signalen boven de ingestelde drempel mogen een papertrade openen.

Standaard:

```env
MIN_CONFIDENCE_SCORE=75
```

Onder de drempel:

- signaal wel opslaan;
- trade niet openen;
- reden loggen.

Boven de drempel:

- risk check uitvoeren;
- papertrade openen als risk check akkoord is.

---

# Papertrading-engine

Papertrading moet realistisch zijn.

Elke papertrade moet volledig worden opgeslagen.

Velden:

```txt
trade_id
symbol
timeframe
direction
entry_price
stop_loss
take_profit_1
take_profit_2
exit_price
status
opened_at
closed_at
pnl_percentage
risk_reward
confidence_score
technical_reason
strategy_modules_used
fees
slippage
result
```

Ondersteun statussen:

```txt
OPEN
TP1_HIT
TP2_HIT
STOP_LOSS_HIT
CLOSED
CANCELLED
SKIPPED
```

Papertrading moet rekening houden met:

```txt
fees
slippage
spread
risk per trade
max open trades
max daily loss
```

Geen papertrade zonder:

```txt
entry
stoploss
take profit
direction
confidence score
reason
```

---

# Risk management

Risk management is verplicht en mag niet optioneel zijn.

Standaard:

```env
MAX_RISK_PER_TRADE=1
MAX_DAILY_LOSS=3
MAX_OPEN_TRADES=1
MAX_TRADES_PER_DAY=3
```

Regels:

1. Geen trade zonder stoploss.
2. Geen trade zonder take profit.
3. Geen trade zonder confidence score.
4. Geen trade als daily loss bereikt is.
5. Geen trade als max open trades bereikt is.
6. Geen trade als max trades per day bereikt is.
7. Geen trade als kill switch actief is.
8. Geen live order zolang live trading uit staat.
9. Geen trade als data incompleet of oud is.
10. Geen trade als spread/slippage onacceptabel is.

---

# Kill switch

Implementeer altijd:

```env
KILL_SWITCH=false
```

Als `KILL_SWITCH=true`:

- geen nieuwe trades;
- bestaande papertrades alleen monitoren;
- Telegram-alert sturen;
- log-event aanmaken;
- dashboard moet duidelijk tonen dat trading gepauzeerd is.

Voorbeeldlog:

```txt
KILL_SWITCH active: new trades blocked
```

---

# Dashboard

Maak een eenvoudige maar nette webinterface.

Minimale pagina’s:

```txt
/dashboard
/signals
/papertrades
/settings
/logs
```

Dashboard toont:

```txt
active symbols
trading mode
live trading status
kill switch status
MEXC status
Telegram status
open papertrades
closed papertrades
latest signals
skipped trades
winrate
profit/loss
profit factor
average R/R
daily loss status
risk status
```

Fase 1 hoeft niet perfect mooi te zijn, maar moet duidelijk, bruikbaar en overzichtelijk zijn.

---

# Telegram-alerts

Maak Telegram-alerts voor:

```txt
nieuw signaal
trade geopend
trade overgeslagen
TP1 geraakt
TP2 geraakt
stoploss geraakt
daily loss bereikt
kill switch actief
MEXC API error
worker restart
dagelijkse samenvatting
```

Voorbeeldalert:

```txt
BTCUSDT LONG signal
Score: 82
Entry: 68420
SL: 67680
TP1: 69500
TP2: 70800
Reason: EMA bullish, RSI recovery, bullish shakeout, volume confirmation
Mode: PAPER
```

Secrets mogen nooit in Telegram-berichten terechtkomen.

---

# Database

Gebruik PostgreSQL en Prisma.

Minimale tabellen:

```txt
symbols
candles
signals
trades
trade_events
strategy_scores
bot_logs
settings
```

## symbols

```txt
id
symbol
base_asset
quote_asset
is_active
risk_class
created_at
updated_at
```

## candles

```txt
id
symbol
timeframe
open_time
close_time
open
high
low
close
volume
created_at
```

## signals

```txt
id
symbol
timeframe
direction
score
reason
status
created_at
```

## trades

```txt
id
symbol
timeframe
direction
entry_price
stop_loss
take_profit_1
take_profit_2
exit_price
status
pnl_percentage
confidence_score
opened_at
closed_at
mode
```

## trade_events

```txt
id
trade_id
event_type
message
price
created_at
```

## strategy_scores

```txt
id
signal_id
module
score
reason
created_at
```

## bot_logs

```txt
id
level
message
context
created_at
```

## settings

```txt
id
key
value
created_at
updated_at
```

---

# Backtesting

Backtesting mag simpel beginnen, maar de structuur moet voorbereid zijn.

Eerste versie:

- gebruik historische candles;
- draai dezelfde strategie-engine;
- toon resultaten per symbol/timeframe.

Rapporteer:

```txt
number_of_trades
winrate
net_profit
max_drawdown
profit_factor
average_win
average_loss
best_timeframe
worst_timeframe
```

Backtesting mag niet afwijken van de papertradinglogica. Dezelfde strategie-engine moet worden hergebruikt.

---

# Sentiment-engine latere fase

Sentiment is niet nodig voor fase 1A.

Later uitbreidbaar met:

```txt
tweets van Elon Musk
tweets van Donald Trump
crypto nieuws
exchange listings
roadmap-updates
whale alerts
trending coins
DEXTools trends
```

Belangrijke regel:

Sentiment mag niet blind trades openen.

Sentiment mag alleen:

- confidence score verhogen;
- confidence score verlagen;
- extra waarschuwing toevoegen;
- trade blokkeren bij extreem risico.

Technische setup blijft leidend.

---

# VPS deployment

Het platform moet via Docker Compose kunnen draaien.

Minimale services:

```yaml
services:
  app:
    build: .
    restart: unless-stopped
    env_file:
      - .env
    depends_on:
      - db
      - redis

  db:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_DB: tradingplatformcodex
      POSTGRES_USER: tradingplatformcodex
      POSTGRES_PASSWORD: change_me
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7
    restart: unless-stopped

volumes:
  postgres_data:
```

Documenteer in `README.md`:

```txt
git clone
cd TradePlatformCodex
cp .env.example .env
docker compose up -d
docker compose logs -f
```

---

# Security-eisen

Beveiliging is verplicht.

Regels:

1. Geen secrets in GitHub.
2. Geen API keys in logs.
3. `.env` nooit committen.
4. `.env.example` wel committen.
5. MEXC API-key in fase 1 alleen read-only.
6. Withdraw-permissies nooit aanzetten.
7. Live trading standaard onmogelijk maken.
8. Dashboard later achter login zetten.
9. SSH naar VPS via key-based login.
10. Firewall beperken tot noodzakelijke poorten.
11. Gebruik veilige defaults.
12. Toon nooit API secrets in foutmeldingen.
13. Maak duidelijke healthchecks.
14. Voeg `.gitignore` toe met minimaal `.env`, `node_modules`, `.next`, `dist`, logs en build-output.

---

# Wat Marcel moet aanleveren

Marcel levert aan:

```txt
GitHub repo: cryptoprins-ship-it/TradePlatformCodex
VPS IP-adres
SSH-toegang
Domein of subdomein
MEXC API key read-only
Telegram bot token
Telegram chat ID
Gewenste startconfig
```

Advies:

```txt
Repo: cryptoprins-ship-it/TradePlatformCodex
Subdomein: tradingplatformcodex.mpsecurity.cloud
Startsymbol: BTCUSDT
Trading mode: paper
Live trading: false
```

---

# Wat Codex mag doen met GitHub-toegang

Codex mag:

1. repo initialiseren;
2. projectstructuur maken;
3. README maken;
4. AGENTS.md maken;
5. `.env.example` maken;
6. `.gitignore` maken;
7. Dockerfile maken;
8. Docker Compose maken;
9. Prisma schema maken;
10. MEXC connector bouwen;
11. strategie-engine bouwen;
12. papertrading-engine bouwen;
13. risk management bouwen;
14. dashboard bouwen;
15. Telegram-alerts bouwen;
16. logging bouwen;
17. tests toevoegen;
18. kleine commits maken.

Codex moet kleine, duidelijke commits maken.

Voorbeelden:

```txt
init tradingplatformcodex project
add docker compose setup
add prisma schema
add mexc market data connector
add strategy scoring engine
add paper trading engine
add risk management
add telegram alerts
add dashboard overview
```

---

# Wat Codex mag doen met VPS-toegang

Codex mag:

1. OS controleren;
2. Docker installeren indien nodig;
3. Docker Compose installeren indien nodig;
4. repo clonen;
5. `.env` aanmaken op VPS;
6. containers starten;
7. logs controleren;
8. healthchecks controleren;
9. Nginx configureren;
10. SSL via Let's Encrypt configureren;
11. updateprocedure documenteren.

Codex mag nooit secrets printen, committen of delen.

---

# Werkwijze voor Codex

Gebruik deze werkwijze bij elke taak.

## 1. Inspecteer

Lees eerst:

```txt
README.md
AGENTS.md
package.json
docker-compose.yml
prisma/schema.prisma
.env.example
bestaande source code
```

## 2. Begrijp

Bepaal:

```txt
wat bestaat al
wat ontbreekt
wat kapot is
wat de kleinste veilige volgende stap is
```

## 3. Bouw klein

Maak kleine wijzigingen.

Niet tegelijk in één rommelige wijziging bouwen:

- database;
- dashboard;
- strategie;
- Telegram;
- deployment;
- backtesting;
- live trading.

## 4. Test

Voer waar mogelijk uit:

```txt
npm install
npm run lint
npm run build
npm run test
docker compose config
docker compose up -d
docker compose logs
```

## 5. Documenteer

Werk README bij als installatie, configuratie of gebruik verandert.

## 6. Commit

Commit alleen werkende logische stappen.

---

# Eerste takenlijst voor Codex

Voer dit uit in volgorde:

```txt
1. Inspecteer de bestaande repository TradePlatformCodex.
2. Maak of update AGENTS.md met deze instructie.
3. Maak een nette projectstructuur.
4. Maak .gitignore.
5. Maak .env.example.
6. Maak Docker Compose met app, PostgreSQL en Redis.
7. Maak basis Next.js app.
8. Maak Prisma schema.
9. Maak database models voor symbols, candles, signals, trades, trade_events, strategy_scores, bot_logs en settings.
10. Maak MEXC market data connector voor BTCUSDT.
11. Maak candle-fetching voor 5m, 15m, 1h en 4h.
12. Maak strategy scoring engine.
13. Maak eerste strategie met EMA, RSI, MACD, volume en wick/shakeout.
14. Maak papertrading-engine.
15. Maak risk management.
16. Maak trade logging.
17. Maak dashboardpagina /dashboard.
18. Maak pagina /signals.
19. Maak pagina /papertrades.
20. Maak pagina /settings.
21. Maak pagina /logs.
22. Maak Telegram-alerts.
23. Maak README met lokale installatie en VPS deployment.
24. Test lokaal.
25. Commit de werkende basis.
```

---

# Definition of Done fase 1A

Fase 1A is klaar als:

```txt
BTCUSDT werkt
market data wordt opgehaald
candles worden verwerkt
signalen worden berekend
signals worden opgeslagen
papertrades kunnen worden geopend
papertrades kunnen worden gesloten
risk management werkt
dashboard toont resultaten
Telegram stuurt alerts
Docker Compose werkt
README klopt
live trading staat uit
```

---

# Definition of Done fase 1B

Fase 1B is klaar als:

```txt
ETHUSDT toegevoegd is
BTC en ETH naast elkaar werken
dashboard filtert per symbol
resultaten per symbol zichtbaar zijn
strategie-performance per symbol zichtbaar is
risk management over meerdere symbolen correct werkt
```

---

# Verboden in fase 1

Niet doen:

```txt
geen live trading
geen echte orders
geen withdraw-permissies
geen memecoins
geen AI-optimalisatie zonder logs
geen grote refactors zonder noodzaak
geen secrets in repo
geen dashboard zonder risk status
geen trading zonder stoploss
geen trading zonder logging
geen extra coins voordat BTC stabiel werkt
```

---

# Kwaliteitslat

Codex moet bouwen alsof de code door een andere senior developer wordt reviewed.

Elke module moet:

```txt
duidelijk zijn
testbaar zijn
uitbreidbaar zijn
veilig falen
goede foutafhandeling hebben
geen secrets lekken
logging hebben
```

---

# Belangrijke eindregel

Maak het eerst werkend.

Daarna pas slimmer.

Daarna pas mooier.

Daarna pas uitbreiden.

BTC eerst.

ETH daarna.

SOL en XRP later.

Live trading pas veel later.
