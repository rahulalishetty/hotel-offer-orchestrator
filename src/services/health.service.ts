import { env } from '../config/env.config';
import { pingRedis } from '../models/hotel.model';

async function checkSupplier(path: string): Promise<boolean> {
  try {
    const response = await fetch(`http://localhost:${env.port}${path}?city=delhi`);
    return response.ok;
  } catch {
    return false;
  }
}

export async function getHealth() {
  const [supplierA, supplierB, redis] = await Promise.all([
    checkSupplier('/supplierA/hotels'),
    checkSupplier('/supplierB/hotels'),
    pingRedis(),
  ]);
  return {
    status: supplierA && supplierB && redis ? 'ok' : 'degraded',
    suppliers: { supplierA, supplierB },
    redis,
  };
}
