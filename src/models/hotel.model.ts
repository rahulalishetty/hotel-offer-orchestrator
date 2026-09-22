import { redis } from '../config/db.config';
import { env } from '../config/env.config';
import type { HotelOffer, HotelRefresh } from '../types/hotel.types';
import { hotelIndexKey, hotelDataKey, hotelVersionKey } from '../utils/redis.utils';

const BEGIN_REFRESH = `
redis.call('INCR', KEYS[1])
local now = redis.call('TIME')
return {redis.call('GET', KEYS[1]), tostring(now[1] * 1000 + math.floor(now[2] / 1000) + tonumber(ARGV[1]))}
`;

// Decode and validate arguments before mutating: Redis scripts do not roll back errors.
const SAVE_HOTELS = `
local offers = cjson.decode(ARGV[3])
local expiresAt = tonumber(ARGV[2])
local now = redis.call('TIME')
if expiresAt <= now[1] * 1000 + math.floor(now[2] / 1000) then return 0 end
if redis.call('GET', KEYS[3]) ~= ARGV[1] then return 0 end
redis.call('DEL', KEYS[1], KEYS[2])
for _, offer in ipairs(offers) do
  redis.call('ZADD', KEYS[1], offer.price, offer.name)
  redis.call('HSET', KEYS[2], offer.name, cjson.encode(offer))
end
redis.call('PEXPIREAT', KEYS[1], ARGV[2])
redis.call('PEXPIREAT', KEYS[2], ARGV[2])
return 1
`;

const READ_HOTELS = `
local names = redis.call('ZRANGEBYSCORE', KEYS[1], ARGV[1], ARGV[2])
local values = {}
for _, name in ipairs(names) do
  local value = redis.call('HGET', KEYS[2], name)
  if value then table.insert(values, value) end
end
return values
`;

export async function beginHotelRefresh(city: string): Promise<HotelRefresh> {
  const [version, expiresAt] = await redis.eval(
    BEGIN_REFRESH, 1, hotelVersionKey(city), env.hotelOfferTtlSeconds * 1000,
  ) as [string, string];
  return { version, expiresAt: Number(expiresAt) };
}

export async function saveHotels(city: string, hotels: HotelOffer[], refresh: HotelRefresh): Promise<boolean> {
  if (!Number.isSafeInteger(refresh.expiresAt) || !/^\d+$/.test(refresh.version) ||
      hotels.some(hotel => typeof hotel.name !== 'string' || !Number.isFinite(hotel.price))) {
    throw new Error('Invalid hotel snapshot');
  }
  const saved = await redis.eval(SAVE_HOTELS, 3,
    hotelIndexKey(city), hotelDataKey(city), hotelVersionKey(city),
    refresh.version, refresh.expiresAt, JSON.stringify(hotels));
  return saved === 1;
}

/** Read the price index and payloads in a single atomic Redis operation. */
export async function getHotelsByPrice(
  city: string,
  minPrice: number | string = '-inf',
  maxPrice: number | string = '+inf',
): Promise<HotelOffer[]> {
  const values = await redis.eval(READ_HOTELS, 2,
    hotelIndexKey(city), hotelDataKey(city), minPrice, maxPrice) as string[];
  return values.map(value => JSON.parse(value) as HotelOffer);
}

export async function pingRedis(): Promise<boolean> {
  try {
    await redis.ping();
    return true;
  } catch {
    return false;
  }
}
