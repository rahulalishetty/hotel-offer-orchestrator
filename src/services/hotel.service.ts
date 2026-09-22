import type { Client } from '@temporalio/client';
import { env } from '../config/env.config';
import { getHotelsByPrice } from '../models/hotel.model';
import type { HotelOffer, HotelQuery } from '../types/hotel.types';
import { createHotelWorkflowId } from '../utils/request.utils';

export function createHotelService(temporalClient: Client) {
  return async ({ city, minPrice, maxPrice }: HotelQuery): Promise<HotelOffer[]> => {
    await temporalClient.workflow.execute('hotelOfferWorkflow', {
      taskQueue: env.temporalTaskQueue,
      workflowId: createHotelWorkflowId(city),
      args: [city],
    });
    // Redis applies the price filter using its sorted-set score index.
    return getHotelsByPrice(city, minPrice ?? '-inf', maxPrice ?? '+inf');
  };
}
