import type { CreatePortfolioDto } from '../dtos/portfolio.dto';
import type { IPortfolioPort } from '../ports/portfolio.port';
import type { Portfolio } from '../../models/portfolio';

export class CreatePortfolioService {
  constructor(private readonly portfolioPort: IPortfolioPort) {}

  async execute(input: CreatePortfolioDto): Promise<Portfolio> {
    return this.portfolioPort.create({ name: input.name });
  }
}
