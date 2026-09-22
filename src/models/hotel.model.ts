import { redis } from '../config/db.config';
import type { HotelOffer } from '../types/hotel.types';
import { hotelIndexKey, hotelDataKey } from '../utils/redis.utils';

export async function saveHotels(city: string, hotels: HotelOffer[]): Promise<void> {
  const indexKey = hotelIndexKey(city);
  const dataKey = hotelDataKey(city);
  const pipeline = redis.pipeline();

  pipeline.del(indexKey, dataKey);
  for (const hotel of hotels) {
    pipeline.zadd(indexKey, hotel.price, hotel.name);
    pipeline.hset(dataKey, hotel.name, JSON.stringify(hotel));
  }
  await pipeline.exec();
}

/**
 * Filtering happens in Redis: ZRANGEBYSCORE selects hotel names whose stored
 * price falls inside the requested range; HGET then retrieves the JSON payload.
 */
export async function getHotelsByPrice(
  city: string,
  minPrice: number | string = '-inf',
  maxPrice: number | string = '+inf',
): Promise<HotelOffer[]> {
  const names = await redis.zrangebyscore(hotelIndexKey(city), minPrice, maxPrice);
  if (names.length === 0) return [];

  const values = await redis.hmget(hotelDataKey(city), ...names);
  return values.filter((value): value is string => value !== null).map((value) => JSON.parse(value) as HotelOffer);
}

export async function pingRedis(): Promise<boolean> {
  try {
    await redis.ping();
    return true;
  } catch {
    return false;
  }
}
