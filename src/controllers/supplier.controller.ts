import type { Request, Response } from 'express';
import { supplierEnabled } from '../config/env.config';
import { getSupplierHotels } from '../services/supplier.service';
import type { Supplier } from '../types/supplier.types';

export function createSupplierController(supplier: Supplier) {
  return (req: Request, res: Response) => {
    if (!supplierEnabled(supplier)) {
      return res.status(503).json({ error: `Supplier ${supplier} is unavailable` });
    }
    const city = String(req.query.city ?? '').trim().toLowerCase();
    return res.json(getSupplierHotels(supplier, city));
  };
}
