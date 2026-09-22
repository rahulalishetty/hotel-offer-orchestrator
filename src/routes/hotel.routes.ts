import { Router } from 'express';
import { createHotelController } from '../controllers/hotel.controller';
import type { createHotelService } from '../services/hotel.service';

export function createHotelRouter(aggregateHotels: ReturnType<typeof createHotelService>) {
  const router = Router();
  router.get('/hotels', createHotelController(aggregateHotels));
  return router;
}
