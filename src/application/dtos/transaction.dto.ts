import { z } from 'zod';

const TransactionItemSchema = z.object({
  tickerSymbol: z.string().min(1, 'tickerSymbol is required'),
  transactionDate: z.string().datetime({ message: 'transactionDate must be ISO8601' }),
  transactionType: z.enum(['buy', 'sell']),
  quantity: z.number().positive('quantity must be positive'),
  price: z.number().positive('price must be positive'),
  currency: z.string().length(3).default('AUD'),
  transactionCost: z.number().min(0).default(0),
});

export type TransactionItemDto = z.infer<typeof TransactionItemSchema>;

export const BulkUploadTransactionsSchema = z.object({
  transactions: z
    .array(TransactionItemSchema)
    .min(1, 'At least one transaction required')
    .max(1000, 'Maximum 1000 transactions per request'),
});

export type BulkUploadTransactionsDto = z.infer<typeof BulkUploadTransactionsSchema>;

export const UpdateTransactionSchema = z.object({
  transactionDate: z.string().datetime().optional(),
  transactionType: z.enum(['buy', 'sell']).optional(),
  quantity: z.number().positive().optional(),
  price: z.number().positive().optional(),
  currency: z.string().length(3).optional(),
  transactionCost: z.number().min(0).optional(),
});

export type UpdateTransactionDto = z.infer<typeof UpdateTransactionSchema>;
