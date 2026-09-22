import { saveHotels, getHotelsByPrice } from '../models/hotel.model';
import type { HotelOffer, HotelRefresh } from '../types/hotel.types';

export { beginHotelRefresh } from '../models/hotel.model';

export async function persistHotels(city: string, hotels: HotelOffer[], refresh: HotelRefresh): Promise<boolean> {
  return saveHotels(city, hotels, refresh);
}

export async function queryHotelsFromRedis(
  city: string,
  minPrice?: number,
  maxPrice?: number,
): Promise<HotelOffer[]> {
  return getHotelsByPrice(city, minPrice ?? '-inf', maxPrice ?? '+inf');
}
