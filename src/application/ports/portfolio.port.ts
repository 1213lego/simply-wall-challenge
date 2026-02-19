import type { Portfolio } from '../../models/portfolio';

export interface IPortfolioPort {
  findById(id: string): Promise<Portfolio | null>;
  create(data: { name: string }): Promise<Portfolio>;
}
