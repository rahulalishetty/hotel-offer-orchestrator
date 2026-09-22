import express from 'express';
import { loggerMiddleware } from './middleware/logger.middleware';
import { createHotelRouter } from './routes/hotel.routes';
import { supplierRouter } from './routes/supplier.routes';
import { healthRouter } from './routes/health.routes';
import type { createHotelService } from './services/hotel.service';

export function createApp(aggregateHotels: ReturnType<typeof createHotelService>) {
  const app = express();
  app.use(express.json());
  app.use(loggerMiddleware);
  app.use(supplierRouter);
  app.use(healthRouter);
  app.use('/api', createHotelRouter(aggregateHotels));
  return app;
}
