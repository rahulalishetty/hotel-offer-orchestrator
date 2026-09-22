import Redis from 'ioredis';
import { env } from './env.config';

export const redis = new Redis(env.redisUrl, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

export async function closeRedis(): Promise<void> {
  try {
    // QUIT flushes queued commands on a healthy connection. An unused or broken
    // connection must be disconnected without triggering a new connection.
    if (redis.status === 'ready') await redis.quit();
  } finally {
    redis.disconnect();
  }
}
