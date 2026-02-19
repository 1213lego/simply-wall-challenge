import { z } from 'zod';

const ConfigSchema = z.object({
  PORT: z.string().optional().default('3000').transform(Number).pipe(z.number().int().positive()),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  CSV_FILE_PATH: z.string().optional().default('./ASX_SQL_DUMP.csv'),
});

const parsed = ConfigSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const config = {
  port: parsed.data.PORT,
  nodeEnv: parsed.data.NODE_ENV,
  databaseUrl: parsed.data.DATABASE_URL,
  csvFilePath: parsed.data.CSV_FILE_PATH,
};
