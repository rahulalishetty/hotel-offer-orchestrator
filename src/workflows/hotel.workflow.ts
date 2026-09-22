import { proxyActivities } from '@temporalio/workflow';
import type * as supplierActivities from '../activities/supplier.activities';
import type * as redisActivities from '../activities/redis.activities';
import type { HotelOffer } from '../types/hotel.types';
import type { SupplierHotel } from '../types/supplier.types';

const { fetchSupplierA, fetchSupplierB } = proxyActivities<typeof supplierActivities>({
  startToCloseTimeout: '10 seconds',
  retry: { maximumAttempts: 3 },
});

const { persistHotels } = proxyActivities<typeof redisActivities>({
  startToCloseTimeout: '10 seconds',
  retry: { maximumAttempts: 3 },
});

export async function hotelOfferWorkflow(city: string): Promise<HotelOffer[]> {
  // Temporal executes these two activities independently and waits for both.
  const [supplierA, supplierB] = await Promise.all([
    fetchSupplierA(city),
    fetchSupplierB(city),
  ]);

  const byName = new Map<string, HotelOffer>();
  const consider = (hotel: SupplierHotel, supplier: HotelOffer['supplier']) => {
    const candidate: HotelOffer = {
      name: hotel.name,
      price: hotel.price,
      supplier,
      commissionPct: hotel.commissionPct,
    };
    const key = hotel.name.trim().toLowerCase();
    const existing = byName.get(key);
    if (!existing || candidate.price < existing.price) {
      byName.set(key, candidate);
    }
  };

  for (const hotel of supplierA) consider(hotel, 'Supplier A');
  for (const hotel of supplierB) consider(hotel, 'Supplier B');

  const result = Array.from(byName.values()).sort((a, b) => a.price - b.price || a.name.localeCompare(b.name));
  await persistHotels(city, result);
  return result;
}
