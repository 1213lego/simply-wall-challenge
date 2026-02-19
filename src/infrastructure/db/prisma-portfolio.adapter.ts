import type { PrismaClient } from '@prisma/client';
import type { IPortfolioPort } from '../../application/ports/portfolio.port';
import type { Portfolio } from '../../models/portfolio';

export class PrismaPortfolioAdapter implements IPortfolioPort {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<Portfolio | null> {
    const portfolio = await this.prisma.portfolio.findUnique({ where: { id } });
    if (!portfolio) return null;
    return { id: portfolio.id, name: portfolio.name };
  }

  async create(data: { name: string }): Promise<Portfolio> {
    const portfolio = await this.prisma.portfolio.create({ data });
    return { id: portfolio.id, name: portfolio.name };
  }
}
