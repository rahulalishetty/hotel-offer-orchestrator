import { Router } from 'express';
import { createSupplierController } from '../controllers/supplier.controller';

export const supplierRouter = Router();
supplierRouter.get('/supplierA/hotels', createSupplierController('A'));
supplierRouter.get('/supplierB/hotels', createSupplierController('B'));
