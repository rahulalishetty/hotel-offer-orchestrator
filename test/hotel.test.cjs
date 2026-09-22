const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHotelController } = require('../dist/controllers/hotel.controller');
const { createSupplierController } = require('../dist/controllers/supplier.controller');
const { createHotelService } = require('../dist/services/hotel.service');
const { redis } = require('../dist/config/db.config');

function response() {
  return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

test('hotel requests reject invalid ranges before invoking aggregation', async () => {
  let called = false;
  const handler = createHotelController(async () => { called = true; return []; });
  const res = response();
  await handler({ query: { city: 'delhi', minPrice: '9000', maxPrice: '5000' } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(called, false);
});

test('hotel requests parse query values and return service results', async () => {
  const hotels = [{ name: 'Holtin', price: 5340, supplier: 'Supplier B', commissionPct: 20 }];
  const handler = createHotelController(async (query) => {
    assert.deepEqual(query, { city: 'Delhi', minPrice: 5000, maxPrice: 8000 });
    return hotels;
  });
  const res = response();
  await handler({ query: { city: ' Delhi ', minPrice: '5000', maxPrice: '8000' } }, res);
  assert.deepEqual(res.body, hotels);
});

test('aggregation failures retain the 502 error contract', async () => {
  const handler = createHotelController(async () => { throw new Error('Workflow failed'); });
  const res = response();
  await handler({ query: { city: 'delhi' }, log: { error() {} } }, res);
  assert.equal(res.statusCode, 502);
  assert.deepEqual(res.body, { error: 'Unable to aggregate hotel offers', message: 'Workflow failed' });
});

test('supplier endpoints normalize cities and honor outage flags', () => {
  const previous = process.env.SUPPLIER_A_ENABLED;
  try {
    process.env.SUPPLIER_A_ENABLED = 'true';
    const res = response();
    createSupplierController('A')({ query: { city: ' Delhi ' } }, res);
    assert.equal(res.body.length, 4);
    assert.ok(res.body.every(hotel => hotel.city === 'delhi'));
    process.env.SUPPLIER_A_ENABLED = 'false';
    const unavailable = response();
    createSupplierController('A')({ query: {} }, unavailable);
    assert.equal(unavailable.statusCode, 503);
    assert.deepEqual(unavailable.body, { error: 'Supplier A is unavailable' });
  } finally {
    if (previous === undefined) delete process.env.SUPPLIER_A_ENABLED;
    else process.env.SUPPLIER_A_ENABLED = previous;
  }
});

test('aggregation completes the workflow before applying the Redis price range', async (t) => {
  let completed = false;
  const offer = { name: 'Holtin', price: 5340, supplier: 'Supplier B', commissionPct: 20 };
  t.mock.method(redis, 'eval', async (script, keyCount, ...args) => {
    assert.equal(completed, true);
    assert.equal(keyCount, 2);
    assert.deepEqual(args, ['hotels:{delhi}:by-price', 'hotels:{delhi}:data', 5000, 8000]);
    return [JSON.stringify(offer)];
  });
  const aggregate = createHotelService({ workflow: { execute: async (name, options) => {
    assert.equal(name, 'hotelOfferWorkflow');
    assert.deepEqual(options.args, ['Delhi']);
    assert.match(options.workflowId, /^hotel-offers-delhi-/);
    completed = true;
  } } });
  assert.deepEqual(await aggregate({ city: 'Delhi', minPrice: 5000, maxPrice: 8000 }), [offer]);
});
