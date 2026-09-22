import { fetchSupplier } from '../services/supplier.service';
import type { SupplierHotel } from '../types/supplier.types';

export async function fetchSupplierA(city: string): Promise<SupplierHotel[]> {
  return fetchSupplier('/supplierA/hotels', city);
}

export async function fetchSupplierB(city: string): Promise<SupplierHotel[]> {
  return fetchSupplier('/supplierB/hotels', city);
}
