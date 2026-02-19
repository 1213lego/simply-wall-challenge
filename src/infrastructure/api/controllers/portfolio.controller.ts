import type { Request, Response, NextFunction } from 'express';
import type { CreatePortfolioService } from '../../../application/services/create-portfolio.service';
import type { GetPortfolioReturnsService } from '../../../application/services/get-portfolio-returns.service';
import { CreatePortfolioSchema, GetReturnsQuerySchema } from '../../../application/dtos/portfolio.dto';
import { ValidationException } from '../../../application/exceptions/validation.exception';

export class PortfolioController {
  constructor(
    private readonly createPortfolioService: CreatePortfolioService,
    private readonly getPortfolioReturnsService: GetPortfolioReturnsService,
  ) {}

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const bodyResult = CreatePortfolioSchema.safeParse(req.body);
      if (!bodyResult.success) {
        throw new ValidationException('Invalid portfolio data', bodyResult.error.flatten());
      }
      const portfolio = await this.createPortfolioService.execute(bodyResult.data);
      res.status(201).json({ portfolioId: portfolio.id, name: portfolio.name });
    } catch (err) {
      next(err);
    }
  }

  async getReturns(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const queryResult = GetReturnsQuerySchema.safeParse(req.query);
      if (!queryResult.success) {
        throw new ValidationException('Invalid query parameters', queryResult.error.flatten());
      }

      const portfolioId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const result = await this.getPortfolioReturnsService.execute(
        portfolioId,
        queryResult.data.days,
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
}
