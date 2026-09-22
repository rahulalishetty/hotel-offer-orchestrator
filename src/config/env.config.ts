const shutdownTimeoutMs = Number(process.env.SHUTDOWN_TIMEOUT_MS ?? 30000);
if (!Number.isSafeInteger(shutdownTimeoutMs) || shutdownTimeoutMs <= 0 || shutdownTimeoutMs > 2147483647) {
  throw new Error('SHUTDOWN_TIMEOUT_MS must be a positive integer <= 2147483647');
}

const hotelOfferTtlSeconds = Number(process.env.HOTEL_OFFER_TTL_SECONDS ?? 300);
if (!Number.isSafeInteger(hotelOfferTtlSeconds) || hotelOfferTtlSeconds <= 0 || hotelOfferTtlSeconds > 2147483647) {
  throw new Error('HOTEL_OFFER_TTL_SECONDS must be a positive integer <= 2147483647');
}

export const env = {
  shutdownTimeoutMs,
  port: Number(process.env.PORT ?? 3000),
  temporalAddress: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233',
  temporalNamespace: process.env.TEMPORAL_NAMESPACE ?? 'default',
  temporalTaskQueue: process.env.TEMPORAL_TASK_QUEUE ?? 'hotel-offer-task-queue',
  hotelOfferTtlSeconds,
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  supplierBaseUrl: process.env.SUPPLIER_BASE_URL ?? 'http://localhost:3000',
  logLevel: process.env.LOG_LEVEL ?? 'info',
};

export function supplierEnabled(name: 'A' | 'B'): boolean {
  return process.env[`SUPPLIER_${name}_ENABLED`] !== 'false';
}
