// The shared hash tag keeps each city's keys in one Redis Cluster slot.
const cityTag = (city: string) => `{${encodeURIComponent(city.trim().toLowerCase())}}`;
export const hotelIndexKey = (city: string) => `hotels:${cityTag(city)}:by-price`;
export const hotelDataKey = (city: string) => `hotels:${cityTag(city)}:data`;
export const hotelVersionKey = (city: string) => `hotels:${cityTag(city)}:version`;
