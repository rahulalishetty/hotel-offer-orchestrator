import { supplierA, supplierB } from '../models/supplier.model';
import type { SupplierHotel } from '../types/supplier.types';
import { env } from '../config/env.config';
import { logger } from '../config/logging.config';

export function getSupplierHotels(supplier: 'A' | 'B', city: string): SupplierHotel[] {
  const normalizedCity = city.trim().toLowerCase();
  const source = supplier === 'A' ? supplierA : supplierB;
  return source
    .filter((hotel) => hotel.city === normalizedCity)
    .map((hotel) => ({ ...hotel }));
}


const baseUrl = env.supplierBaseUrl;

export async function fetchSupplier(path: '/supplierA/hotels' | '/supplierB/hotels', city: string): Promise<SupplierHotel[]> {
  const url = new URL(path, baseUrl);
  url.searchParams.set('city', city);

  logger.info({ url: url.toString(), city }, 'Fetching supplier offers');
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Supplier request failed: ${response.status} ${response.statusText}`);
  }

  const body: unknown = await response.json();
  if (!Array.isArray(body)) throw new Error('Supplier returned a non-array response');
  return body as SupplierHotel[];
}

