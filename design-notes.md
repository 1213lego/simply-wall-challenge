# Simply wall challenge breakdown

API for managing multiple portfolios and their transactions. The api initally will offer the following features:
- create a new portfolio
- bulk upload of transactions [{}, .....]
- modifications to the transactions
   - update a transaction
   - delete transaction
- 30d porfolio return with daily data points

# Stock tickers price data source
In this case the data came from the csv file with asx stocks. The columns are:
COMPANY_ID,UNIQUE_SYMBOL,TICKER_SYMBOL,COMPANY_NAME,EXCHANGE_SYMBOL,EXCHANGE_COUNTRY_ISO,PRIMARY_INDUSTRY_ID,TRADING_ITEM_ID,PRICING_DATE,PRICE_CLOSE,PRICE_CLOSE_USD,SHARES_OUTSTANDING,MARKET_CAP.
I generated a script `scripts/analyze_csv.js` with ai to confirm the data quality and structure. All rows are complete in terms of columns. Only asx exchange, no missing prices and there is the price in AUD PRICE_CLOSE and in USD PRICE_CLOSE_USD. The only thing, there is multiple rows accounting same PRICE_CLOSE to the same company and date with a slighy difference in the PRICE_CLOSE (usd)



# modeling

I am going to normalize and plan first the models involved on the porfolio management and for the stock tickers. Mainly with the stock tickers aiming to eliminate redundant data, so we do not store the name of the company, id and country for every new price of the ticker.

## ticker prices
companies (COMPANY_ID, COMPANY_NAME, PRIMARY_INDUSTRY_ID) can have multiple TRADING_ITEM_ID(represents stock with TICKER_SYMBOL) for example companies that give different types of stock class a, class b, or operates in multiple exchange ASX and NYSE. Even the csv only contains only asx stocks it wouldn't be to much if we consider in this model a company in multiple exchanges so we can have trading_items(TRADING_ITEM_ID, ref COMPANY_ID, EXCHANGE_SYMBOL, TICKER_SYMBOL, EXCHANGE_COUNTRY_ISO) making unique(EXCHANGE_SYMBOL, TICKER_SYMBOL). Then to have historical_prices (id,ref TRADING_ITEM_ID, PRICING_DATE, PRICE_CLOSE_AUD (PRICE_CLOSE), PRICE_CLOSE_USD, SHARES_OUTSTANDING, MARKET_CAP  ).
We could also consider a table exchanges(EXCHANGE_SYMBOL, EXCHANGE_SYMBOL) to avoid repetition of the country id in trading_items. However, i consider with companies, trading_items and historical_prices will be sufficient to have low redundancy and support stocks listed in multiple exchange or class a/b stocks.

companies {
    id uuid primary # COMPANY_ID
    name varchar(255) not null # COMPANY_NAME
    primary_industry_id int not null # PRIMARY_INDUSTRY_ID
}
trading_items {
    id bigint primary # TRADING_ITEM_ID
    company_id uuid not null ref companies.id
    exchange_symbol varchar(10) not null # EXCHANGE_SYMBOL
    ticker_symbol varchar(20) not null # TICKER_SYMBOL
    exchange_country_iso varchar(2) not null # EXCHANGE_COUNTRY_ISO,
    unique(exchange_symbol, ticker_symbol)
}
historical_prices {
    id uuid primary
    trading_item_id uuid ref trading_items.id not null
    pricing_date timestampz # PRICING_DATE not null
    price_close_aud numeric(18, 6) # PRICE_CLOSE not null
    price_close_usd numeric(24, 12) # PRICE_CLOSE_USD not null
    shares_outstanding bigint # SHARES_OUTSTANDING
    market_cap numeric(32, 12) # MARKET_CAP
    unique(trading_item_id, pricing_date) # this will handle the duplicate price data, for that cases there multiple entries same price and unique symbol at same date just ignore
}

## portfolio
A simply portfolio with a id and name.
portfolios {
    id uuid primary default uuid
    name varchar(255) not null
}

transactions {
    id uuid primary
    portfolio_id uuid ref portfolios.id not null
    trading_item_id uuid ref trading_items.id not null
    transaction_date timestampz not null
    transaction_type enum(buy, sell) not null
    quantity numeric(18, 6) not null
    price numeric(18, 6) not null
    currency varchar(3) not null
    transaction_cost numeric(18, 6) default 0 not null
}
indexed on (portfolio_id, transaction_date desc)
for simplicity asume all will be in AUD, so we do not need to worry about currency conversion.


To build this challenge, I chose Node.js and TypeScript. It is the stack I am most familiar with, and I highly value the robust type safety it provides, along with the performance benefits of Node.js for heavy I/O applications.
Will be rest api with expressjs for practicity. on real case scenario i will evauluate clients target for UIs graphql will be good pick.
On the data storage i am picking postgresql it is good for the part of relational integrity portfolio, transactions, companies and trading_items. Also it brings strong data types and accurate for numerics data. For historical_prices i will considering another database as this table can grow really fast and we need fast lookups for a price and inserts. I will use postgresql for now with its client pg in nodejs along with the orm prisma as it is simply and light.

# User cases and bussines logic

# loading the data and data loading
When the app starts, it checks if the companies table is empty. If it is, the app loads the CSV file and inserts the data into the companies, trading_items, and historical_prices tables.
The pick for this is csv-parser to parse the csv file and insert the data into the database. This is the best choice as csv-parser is a streaming parser that can handle large files efficiently. We will take batches and run it in the same transaction to speed up the data ingestion.

# create portfolio
simply creates the portfolio on the table portfolios
POST /portfolios
{
    name: string
}
response
{
    portfolioId: string
    name: string
}

# bulk upload of transactions
we are going to set here an albitrary limit of 1000 transactions per bulk upload
1. check for the existence of portfolio if not throw error
1. we split the tickerSymbol by ':', ' ' or '.' and take the last element as the ticker_symbol and the first as the exchange_symbol
2. we check if the trading_item exists in the database with the exchange_symbol and ticker_symbol, if not we ignore it and kept it as rejected with the reason ticker not supported
3. we insert the transaction in the database
Edge cases inventory validation ej sell 100 of BHP but has nerver bough any before
POST /portfolios/:id/transactions
[
    BulkTransactionItem {
        transactionType: buy|sell
        transactionDate: date utc
        tickerSymbol: string this should include exchange ej "ASX:BHP" or "ASX ASZX" or "ASX.BHP"
        quantity: number
        price: number
        currency: string default AUD
    }
]
returns
{
    acceptedTransactions: AcceptedTransaction[] {
        transactionId: string
        tickerSymbol: string ej "ASX:BHP"
        transactionType: buy|sell
        transactionDate: date utc
    }
    rejectedTransactions: [
        {
            transaction: BulkTransactionItem
            reason: string
        }
    ]
}

# update transaction
1. check for the existence of portfolio and transaction if not throw error
2. split the tickerSymbol by ':', ' ' or '.' and take the last element as the ticker_symbol and the first as the exchange_symbol. Only if it is provided
3. we check if the trading_item exists in the database with the exchange_symbol and ticker_symbol. only if it is provided
4. we update the transaction in the database, is partial update so only update fields that are provided
same edge case over sell
path /portfolios/:id/transactions/:transactionId
{
    transactionType: buy|sell
    transactionDate: date utc
    tickerSymbol: string this should include exchange ej "ASX:BHP" or "ASX ASZX" or "ASX.BHP"
    quantity: number
    price: number
    currency: string default AUD
}
returns
{
    transactionId: string
    transactionType: buy|sell
    transactionDate: date utc
    tickerSymbol: string ej "ASX:BHP"
    quantity: number
    price: number
    currency: string default AUD
}

# delete transaction
1. check for the existence of portfolio and transaction if not throw error
2. we delete the transaction in the database
delete /portfolios/:id/transactions/:transactionId
returns
{
    transactionType: buy|sell
    transactionDate: date utc
    tickerSymbol: string ej "ASX:BHP"
    quantity: number
    price: number
    currency: string default AUD
}


# 30d porfolio return with daily data points
There is two popular methods basic market value or Time-Weighted Return (TWR).
Basic market value is simple ((Val_i - Val_{i-1}) / Val_{i-1}) but it is misleading. If you deposit money, it spikes the return. To properly answer "Portfolio Return" and measure performance, we must use Time-Weighted Return (TWR). This isolates the investment performance from cash flows.
for simplicity now basic maket value
we need a functions to get price at date (handling weekends/closed markets with last known price. a price before the date).
it will be usefull to have the holdings, it can be a query on transactions group by trading_item_id and date <= given date and add or subtract the quantity according the transaction type, avg(price).
we can at the beginning get all the holdings at the first date of the range, and then for each day we update the holdings with the transactions of that day.

edge cases mainly related to if there is inconsistency of pricing data or we don't have pricing data for a given date. for example  last price date is 2026-02-04 00:00:00+00 in the csv.

GET /portfolios/:id/returns?days=30
returns
{
    portfolioId: string
    returns: [
        {
             date: date
             portfolioValue: number
             dailyReturn: number TWR %
        }
    ]
}


This will be the project structure i like to organize project oriente to hexagonal architecture with the goal of separating the external world(api, infra, db ) from the core. More on this cases we are not sure about decisions in infra such as the database.


- src
    - models
        - portfolio.ts
        - transaction.ts
        - trading_item.ts
        - historical_price.ts
        - company.ts
    - application
        - exceptions
            - portfolio-not-found.ts
            - transaction-not-found.ts
            - trading_item-not-found.ts
            - validation.ts
        - ports
            - portfolio.ts create portfolio
            - transaction.ts buld upload, update, delete, function to get holdings at given date
            - trading_item.ts  function get trading item by exchange and ticker symbol
            - historical_prices.ts function to get price by trading item id and date also function to get last known price before a given date
        - services (UseCase Driven)
            - create-portfolio.ts
            - bulk-upload-transactions.ts
            - update-transaction.ts
            - delete-transaction.ts
            - get-portfolio-returns.ts
            - stock-loader.ts
        - dtos
            - portfolio.dto.ts
            - transaction.dto.ts
    - infrastructure
        - db
            - prisma-portfolio.ts
            - prisma-transaction.ts
            - prisma-trading_item.ts
            prisma setup /schemas
        - api
            - routes
                - index.ts
            - controllers
                - create-portfolio.ts
                - bulk-upload-transactions.ts
                - update-transaction.ts
                - delete-transaction.ts
                - get-portfolio-returns.ts
            - middlewares
                - error-handler.ts
                - validation.ts
        - csv-loader
            - csv-loader.ts read the csv files and send batches to stock-loader.service.ts
        - cache
    - shared
    - config
    - app.ts
    - index.ts server start up
    - tests
        each service has its own test file, vitest unit test and super test

we use zod for validation, we do validation of input also in services layer using DTOs to ensure type safety and business rule compliance. 




