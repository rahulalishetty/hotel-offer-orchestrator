import type { Request, Response } from 'express';
import { getHealth } from '../services/health.service';

export async function healthController(_req: Request, res: Response) {
  const health = await getHealth();
  return res.status(health.status === 'ok' ? 200 : 503).json(health);
}
