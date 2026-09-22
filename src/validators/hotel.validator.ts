import { z } from 'zod';

export const hotelQuerySchema = z.object({
  city: z.string().trim().min(1),
  minPrice: z.coerce.number().finite().nonnegative().optional(),
  maxPrice: z.coerce.number().finite().nonnegative().optional(),
}).refine((query) => query.minPrice === undefined || query.maxPrice === undefined || query.minPrice <= query.maxPrice, {
  message: 'minPrice must be less than or equal to maxPrice',
  path: ['minPrice'],
});

