import { z } from 'zod';

export const CreatePortfolioSchema = z.object({
  name: z.string().min(1, 'Portfolio name is required').max(255),
});

export type CreatePortfolioDto = z.infer<typeof CreatePortfolioSchema>;

export const GetReturnsQuerySchema = z.object({
  days: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 30))
    .pipe(z.number().int().min(1).max(30)),
});

export type GetReturnsQueryDto = z.infer<typeof GetReturnsQuerySchema>;

