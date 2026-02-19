import fs from 'fs';
import csvParser from 'csv-parser';
import type { StockLoaderService, CsvRow } from '../../application/services/stock-loader.service';

const BATCH_SIZE = 100000;

export async function loadCsv(filePath: string, stockLoader: StockLoaderService): Promise<void> {
  return new Promise((resolve, reject) => {
    const batch: CsvRow[] = [];
    let totalRows = 0;
    let batchCount = 0;

    const stream = fs.createReadStream(filePath).pipe(csvParser());

    stream.on('data', (row: CsvRow) => {
      batch.push(row);
      totalRows++;

      if (batch.length >= BATCH_SIZE) {
        stream.pause();
        const currentBatch = batch.splice(0, BATCH_SIZE);
        batchCount++;

        stockLoader
          .loadBatch(currentBatch)
          .then(() => {
            console.log(
              `[seed] Batch ${batchCount} processed (${currentBatch.length} rows, ${totalRows} total)`,
            );
            stream.resume();
          })
          .catch((err: Error) => {
            stream.destroy(err);
            reject(err);
          });
      }
    });

    stream.on('end', async () => {
      try {
        if (batch.length > 0) {
          batchCount++;
          await stockLoader.loadBatch(batch);
          console.log(
            `[seed] Batch ${batchCount} processed (${batch.length} rows, ${totalRows} total)`,
          );
        }
        console.log(`[seed] Complete: ${totalRows} total rows across ${batchCount} batches`);
        resolve();
      } catch (err) {
        reject(err);
      }
    });

    stream.on('error', reject);
  });
}
