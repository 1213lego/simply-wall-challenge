# Future considerations

Things I would implement with more time, organised by area.

## Domain features

- splits and dividends
- currency in portfolio — the user will want to see the portfolio value in their favourite currency, and transactions can be in different currencies
- users for portfolio and authentication
- implement TWR instead of simple market value

## API / UX improvements

- evaluate target clients — for UIs GraphQL will be a good pick
- async bulk upload (CSV) with a post transaction review to accept or reject transactions

## Architecture

- dependency injection
- data ingestion abstraction to support multiple sources and real time

## Observability

monitoring and logging are important in these systems. I would set up pino for JSON structured logging and OpenTelemetry for traces and metrics.

## Infrastructure / Performance

- a different database for historical_prices, as this table can grow really fast. another option will be to denormalize historical_prices for faster lookup of prices and inserts when the table rows are massive. Definitely deep dive more into this topic
