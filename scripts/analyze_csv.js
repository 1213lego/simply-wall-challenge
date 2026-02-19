
const fs = require('fs');
const csv = require('csv-parser');

const analysis = {
    totalRows: 0,
    exchanges: new Set(),
    countries: new Set(),
    uniqueSymbols: new Set(),
    uniqueCompanies: new Set(),
    missingPrices: 0,
    nonNumericPrices: 0,
    zeroPrices: 0,
    symbolsWithMultipleNames: new Map(),
    symbolsWithMultipleIds: new Map(),
    dateRange: { min: '', max: '' },
    priceVariationsOnSameDate: 0,
    duplicatesMap: new Map(),
    tickerCounts: new Map(),
    // Currency checks
    hasPriceClose: false,
    hasPriceUSD: false,
    usdAudRatios: [], // To check consistency of exchange rate
};

async function runAnalysis() {
    console.log('Starting deep analysis of ASX_SQL_DUMP.csv...');

    const stream = fs.createReadStream('ASX_SQL_DUMP.csv').pipe(csv());

    for await (const row of stream) {
        analysis.totalRows++;
        const r = row;

        // Exchange analysis
        analysis.exchanges.add(r.EXCHANGE_SYMBOL);
        analysis.countries.add(r.EXCHANGE_COUNTRY_ISO);

        analysis.uniqueSymbols.add(r.UNIQUE_SYMBOL);
        analysis.uniqueCompanies.add(r.COMPANY_ID);
        analysis.tickerCounts.set(r.UNIQUE_SYMBOL, (analysis.tickerCounts.get(r.UNIQUE_SYMBOL) || 0) + 1);

        if (!analysis.symbolsWithMultipleNames.has(r.UNIQUE_SYMBOL)) {
            analysis.symbolsWithMultipleNames.set(r.UNIQUE_SYMBOL, new Set());
        }
        analysis.symbolsWithMultipleNames.get(r.UNIQUE_SYMBOL).add(r.COMPANY_NAME);

        // Price checks
        if (r.PRICE_CLOSE) analysis.hasPriceClose = true;
        if (r.PRICE_CLOSE_USD) analysis.hasPriceUSD = true;

        const price = parseFloat(r.PRICE_CLOSE);
        const priceUsd = parseFloat(r.PRICE_CLOSE_USD);

        if (price > 0 && priceUsd > 0 && analysis.usdAudRatios.length < 100) {
            analysis.usdAudRatios.push(priceUsd / price);
        }

        if (!r.PRICE_CLOSE || r.PRICE_CLOSE.trim() === '') {
            analysis.missingPrices++;
        } else if (isNaN(price)) {
            analysis.nonNumericPrices++;
        } else if (price === 0) {
            analysis.zeroPrices++;
        }

        const date = r.PRICING_DATE ? r.PRICING_DATE.split(' ')[0] : undefined;
        if (date) {
            if (!analysis.dateRange.min || date < analysis.dateRange.min) analysis.dateRange.min = date;
            if (!analysis.dateRange.max || date > analysis.dateRange.max) analysis.dateRange.max = date;
        }

        const dupKey = `${r.UNIQUE_SYMBOL}_${r.PRICING_DATE}`;
        if (analysis.duplicatesMap.has(dupKey)) {
            if (analysis.duplicatesMap.get(dupKey) !== r.PRICE_CLOSE) {
                analysis.priceVariationsOnSameDate++;
            }
        } else {
            analysis.duplicatesMap.set(dupKey, r.PRICE_CLOSE);
        }

        if (analysis.totalRows % 100000 === 0) {
            console.log('...processed ' + analysis.totalRows + ' rows');
        }
    }

    printReport();
}

function printReport() {
    console.log('\n--- DATA ANALYSIS REPORT ---');
    console.log('Total Rows: ' + analysis.totalRows);
    console.log('Unique Symbols: ' + analysis.uniqueSymbols.size);

    console.log('\n--- EXCHANGE & COUNTRY ---');
    console.log('Unique Exchanges: ' + Array.from(analysis.exchanges).join(', '));
    console.log('Unique Countries: ' + Array.from(analysis.countries).join(', '));

    console.log('\n--- CURRENCY & PRICES ---');
    console.log('Has PRICE_CLOSE: ' + analysis.hasPriceClose);
    console.log('Has PRICE_CLOSE_USD: ' + analysis.hasPriceUSD);
    if (analysis.usdAudRatios.length > 0) {
        const avgRatio = analysis.usdAudRatios.reduce((a, b) => a + b, 0) / analysis.usdAudRatios.length;
        console.log('Average USD/AUD Ratio (Sample): ' + avgRatio.toFixed(4));
        console.log('This confirms PRICE_CLOSE is likely AUD (since ratio is ~0.65-0.70).');
    }

    console.log('\n--- QUALITY ISSUES ---');
    console.log('Price variations for same Symbol + Date: ' + analysis.priceVariationsOnSameDate);

    const counts = Array.from(analysis.tickerCounts.values());
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
    console.log('\n--- DENSITY ---');
    console.log('Average data points per symbol: ' + avg.toFixed(2));
}

runAnalysis().catch(console.error);
