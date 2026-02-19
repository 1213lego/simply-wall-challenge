export class PortfolioNotFoundException extends Error {
  constructor(portfolioId: string) {
    super(`Portfolio not found: ${portfolioId}`);
    this.name = 'PortfolioNotFoundException';
  }
}
