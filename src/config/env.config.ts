export const env = {
  port: Number(process.env.PORT ?? 3000),
  temporalAddress: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233',
  temporalNamespace: process.env.TEMPORAL_NAMESPACE ?? 'default',
  temporalTaskQueue: process.env.TEMPORAL_TASK_QUEUE ?? 'hotel-offer-task-queue',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  supplierBaseUrl: process.env.SUPPLIER_BASE_URL ?? 'http://localhost:3000',
  logLevel: process.env.LOG_LEVEL ?? 'info',
};

export function supplierEnabled(name: 'A' | 'B'): boolean {
  return process.env[`SUPPLIER_${name}_ENABLED`] !== 'false';
}
