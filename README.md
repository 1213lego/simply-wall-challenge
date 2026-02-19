# Portfolio Management API

A REST API for managing stock portfolios and transactions, built on ASX historical price data.

## Approach

Before writing any code I spent time analysing and breaking down the problem. All my design thinking — data model decisions, trade-offs, API contracts, and edge cases — is documented in [`design-notes.md`](./design-notes.md). I find it useful to think on paper first, especially for the modelling part where decisions compound later.

Once the design was solid I used **Claude Code** (Sonnet 4.6) as an AI pair programmer to speed up boilerplate — Prisma adapter stubs, test scaffolding, and repetitive type wiring. All the core logic (the returns algorithm, the ticker parser, the holdings calculation, the validation layer) was written and reasoned through by me; the AI helped me move faster on the scaffolding layer.

The challenge was genuinely fun. The part that made me think the most was the data model: a company can have multiple trading items (different stock classes, or listed on multiple exchanges), and normalising that correctly upfront meant the rest fell into place cleanly. The other thing that required real thought was the returns calculation — handling the case where a price is not available for a given date (weekends, public holidays) without silently zeroing out the portfolio value.

I also concluded that for `historical_prices` — which is by far the largest table — a slight denormalization (storing the company name or ticker alongside each price row) would speed up both reads and writes significantly at scale, avoiding joins on the hot path. That trade-off is noted in [`future.md`](./future.md) for a deeper evaluation.

Things I would add with more time are collected in [`future.md`](./future.md).

## Shortcuts and assumptions

- **Currency**: all transactions are assumed to be in AUD — no currency conversion is applied. The `currency` field is stored but not used in calculations.
- **Returns method**: basic market value `(V_end − V_start) / V_start` is used instead of TWR. TWR is more correct for measuring investment performance independently of cash flows, but basic market value was chosen for simplicity. Noted in `future.md`.
- **Sell validation**: sells that exceed current holdings are accepted with a warning in the response rather than rejected. No hard inventory enforcement.
- **Price gaps**: weekends and public holidays are handled by carrying forward the last known closing price. If no price exists at all for a held item, its contribution to portfolio value is 0.
- **CSV duplicates**: rows with the same `(tradingItemId, pricingDate)` are silently ignored on upsert via a unique constraint — this was observed in the dataset (same date, same company, slightly different USD price).
- **Database**: PostgreSQL is used for all tables including `historical_prices`. At scale that table would benefit from a time-series database or denormalisation — acknowledged in `future.md`.
- **Bulk upload limit**: capped at 1 000 transactions per API request — an arbitrary limit to keep request sizes reasonable.
- **No authentication**: portfolios are not scoped to users — no auth layer is implemented.
- **No splits or dividends**: transaction history does not account for stock splits or dividend reinvestment.
- **Hard deletes**: transactions are permanently deleted with no audit trail.

## Stack

- **Runtime:** Node.js + TypeScript
- **Framework:** Express.js
- **Database:** PostgreSQL (via Prisma ORM)
- **Validation:** Zod
- **Testing:** Vitest + Supertest
- **Containerisation:** Docker Compose

## Architecture

Hexagonal architecture (ports & adapters) — the domain core is fully decoupled from the database, HTTP layer, and CSV infrastructure.

```
src/
├── models/             # Domain entities (plain interfaces)
├── application/
│   ├── services/       # Use cases
│   ├── ports/          # Repository interfaces
│   ├── dtos/           # Zod-validated input schemas
│   └── exceptions/     # Typed domain exceptions
├── infrastructure/
│   ├── db/             # Prisma adapters (implement ports)
│   ├── api/            # Controllers, routes, error middleware
│   └── csv-loader/     # Streaming CSV ingestion
├── shared/             # Date utilities, ticker parser
├── config/             # Zod-validated environment config
├── app.ts              # Express app factory + DI wiring
└── index.ts            # Server entry point
```

## Data Model

```
Company (1) ──── (N) TradingItem (1) ──── (N) HistoricalPrice
                      TradingItem (1) ──── (N) Transaction
Portfolio   (1) ──── (N) Transaction
```

- `TradingItem.id` is a `BigInt` (sourced from `TRADING_ITEM_ID` in the CSV)
- `HistoricalPrice` has a unique constraint on `(tradingItemId, pricingDate)` — absorbs CSV duplicates
- `Transaction` is indexed on `(portfolioId, transactionDate DESC)`

## Prerequisites

- Docker & Docker Compose
- Node.js ≥ 20
- The `ASX_SQL_DUMP.csv` file in the project root

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Start the database

```bash
docker compose up -d db db_test
```

This starts two PostgreSQL instances:
- Port `5432` — development / production database
- Port `5433` — test database (isolated)

### 3. Configure environment

```bash
cp .env.example .env
```

| Variable | Default | Required |
|----------|---------|----------|
| `DATABASE_URL` | — | Yes |
| `PORT` | `3000` | No |
| `NODE_ENV` | `development` | No |
| `CSV_FILE_PATH` | `./ASX_SQL_DUMP.csv` | No |

### 4. Run migrations

```bash
npm run prisma:migrate
```

### 5. Seed price data

Streams and loads the CSV into `companies`, `trading_items`, and `historical_prices` in batches of 100 000 rows.

```bash
npm run seed
```

### 6. Start the server

```bash
# Development (hot reload)
npm run dev

# Production
npm run build && npm start
```

The API will be available at `http://localhost:3000`.

## Docker

To run the full stack (database + application) in containers:

```bash
docker compose up
```

The app container expects `ASX_SQL_DUMP.csv` to be present in the project root (mounted read-only).

## API Reference

### Health

```
GET /health
```

```json
{ "status": "ok", "timestamp": "2026-02-20T00:00:00.000Z" }
```

---

### Portfolios

#### Create portfolio

```
POST /api/portfolios
```

**Request**

```json
{ "name": "My Portfolio" }
```

**Response** `201`

```json
{ "portfolioId": "uuid", "name": "My Portfolio" }
```

---

#### Get portfolio returns

```
GET /api/portfolios/:id/returns?days=30
```

| Query param | Type | Default | Constraints |
|-------------|------|---------|-------------|
| `days` | integer | `30` | 1 – 30 |

**Response** `200`

```json
{
  "portfolioId": "uuid",
  "returns": [
    {
      "date": "2026-01-22",
      "portfolioValue": 15000.00,
      "dailyReturn": 0.025
    }
  ]
}
```

`dailyReturn` uses the basic market value method: `(V_end − V_start) / V_start`, where `V_start` and `V_end` are the portfolio value at the previous and current day's close. Weekend and public holiday gaps are handled by carrying forward the last known price.

---

### Transactions

#### Bulk upload

```
POST /api/portfolios/:id/transactions
```

Up to 1 000 transactions per request. Ticker symbols are resolved against the loaded ASX data — unknown tickers are rejected. Sells that exceed current holdings are accepted with a warning.

**Request**

```json
{
  "transactions": [
    {
      "tickerSymbol": "ASX:BHP",
      "transactionDate": "2024-01-15T00:00:00Z",
      "transactionType": "buy",
      "quantity": 100,
      "price": 50.00,
      "currency": "AUD",
      "transactionCost": 9.95
    }
  ]
}
```

**Response** `207`

```json
{
  "acceptedTransactions": [
    {
      "transactionId": "uuid",
      "tickerSymbol": "ASX:BHP",
      "transactionType": "buy",
      "transactionDate": "2024-01-15T00:00:00.000Z",
      "warnings": []
    }
  ],
  "rejectedTransactions": [
    {
      "transaction": { "tickerSymbol": "ASX:UNKNOWN", "..." : "..." },
      "reason": "Unknown ticker symbol: ASX:UNKNOWN"
    }
  ]
}
```

Supported ticker formats: `ASX:BHP`, `ASX BHP`, `ASX.BHP`.

---

#### Update transaction

```
PUT /api/portfolios/:id/transactions/:transactionId
```

Partial update — all fields optional.

**Request**

```json
{
  "quantity": 150,
  "price": 52.00
}
```

**Response** `200`

```json
{
  "transaction": {
    "id": "uuid",
    "portfolioId": "uuid",
    "tradingItemId": "20164362",
    "transactionDate": "2024-01-15T00:00:00.000Z",
    "transactionType": "buy",
    "quantity": 150,
    "price": 52.00,
    "currency": "AUD",
    "transactionCost": 9.95
  },
  "warnings": ["Sell quantity exceeds current holdings"]
}
```

---

#### Delete transaction

```
DELETE /api/portfolios/:id/transactions/:transactionId
```

**Response** `200`

```json
{ "message": "Transaction deleted successfully" }
```

---

### Error responses

| Status | Condition |
|--------|-----------|
| `400` | Validation error (invalid body or query params) |
| `404` | Portfolio or transaction not found |
| `500` | Unexpected server error |

```json
{ "error": "Validation Error", "details": { "fieldErrors": { "name": ["Required"] } } }
```

## Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

Tests require the `db_test` container to be running (`docker compose up -d db_test`). The test database is automatically reset before each test suite — no manual teardown needed.

```
tests/
├── unit/           # Service-layer tests with mocked ports
└── integration/    # HTTP-layer tests against a real test database
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start with hot reload (tsx watch) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled server |
| `npm run seed` | Load CSV data into the database |
| `npm test` | Run test suite |
| `npm run test:coverage` | Run tests with coverage |
| `npm run prisma:migrate` | Apply database migrations |
| `npm run prisma:studio` | Open Prisma Studio |
