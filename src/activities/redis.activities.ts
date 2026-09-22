import { saveHotels, getHotelsByPrice } from '../models/hotel.model';
import type { HotelOffer } from '../types/hotel.types';

export async function persistHotels(city: string, hotels: HotelOffer[]): Promise<void> {
  await saveHotels(city, hotels);
}

export async function queryHotelsFromRedis(
  city: string,
  minPrice?: number,
  maxPrice?: number,
): Promise<HotelOffer[]> {
  return getHotelsByPrice(city, minPrice ?? '-inf', maxPrice ?? '+inf');
}
