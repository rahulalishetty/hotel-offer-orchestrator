import type { Request, Response } from 'express';
import type { createHotelService } from '../services/hotel.service';
import { hotelQuerySchema } from '../validators/hotel.validator';

export function createHotelController(aggregateHotels: ReturnType<typeof createHotelService>) {
  return async (req: Request, res: Response) => {
    const parsed = hotelQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid query parameters', details: parsed.error.flatten() });
    }
    try {
      return res.json(await aggregateHotels(parsed.data));
    } catch (error) {
      req.log.error({ err: error, city: parsed.data.city }, 'Hotel aggregation failed');
      return res.status(502).json({
        error: 'Unable to aggregate hotel offers',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}
