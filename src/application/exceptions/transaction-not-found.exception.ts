export class TransactionNotFoundException extends Error {
  constructor(transactionId: string) {
    super(`Transaction not found: ${transactionId}`);
    this.name = 'TransactionNotFoundException';
  }
}
