const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const available = spawnSync('redis-server', ['--version']).status === 0;
test('Redis snapshots enforce versions, atomic reads and fixed expiry', { skip: !available }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hotel-redis-'));
  const socket = join(dir, 'redis.sock');
  const server = spawn('redis-server', ['--port', '0', '--unixsocket', socket, '--save', '', '--appendonly', 'no']);
  let output = '';
  await new Promise((resolve, reject) => {
    server.on('error', reject);
    server.on('exit', code => reject(new Error(`Redis exited ${code}: ${output}`)));
    server.stdout.on('data', chunk => {
      output += chunk;
      if (output.toLowerCase().includes('ready to accept connections')) resolve();
    });
  });
  process.env.REDIS_URL = socket;
  const { redis } = require('../dist/config/db.config');
  const { beginHotelRefresh, saveHotels, getHotelsByPrice } = require('../dist/models/hotel.model');
  const offer = price => [{ name: 'Hotel', price, supplier: 'Supplier A', commissionPct: 10 }];
  try {
    const older = await beginHotelRefresh('Delhi');
    const newer = await beginHotelRefresh('delhi');
    assert.equal(await saveHotels('delhi', offer(200), newer), true);
    assert.equal(await saveHotels('Delhi', offer(100), older), false);
    assert.deepEqual(await getHotelsByPrice('delhi', 150, 250), offer(200));
    assert.equal(await redis.pexpiretime('hotels:{delhi}:data'), newer.expiresAt);
    assert.equal(await redis.pexpiretime('hotels:{delhi}:by-price'), newer.expiresAt);
    await saveHotels('delhi', offer(200), newer);
    assert.equal(await redis.pexpiretime('hotels:{delhi}:data'), newer.expiresAt);
    for (let i = 0; i < 20; i++) {
      const [, found] = await Promise.all([
        saveHotels('delhi', offer(i % 2 ? 100 : 200), newer),
        getHotelsByPrice('delhi', 150, 250),
      ]);
      assert.ok(found.length === 0 || found[0].price === 200);
    }
    assert.equal(await saveHotels('delhi', [], newer), true);
    assert.deepEqual(await getHotelsByPrice('delhi'), []);
    const expiring = { ...newer, expiresAt: Date.now() + 100 };
    await saveHotels('delhi', offer(200), expiring);
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.deepEqual(await getHotelsByPrice('delhi'), []);
    assert.equal(await saveHotels('delhi', offer(200), expiring), false);
    assert.equal(await saveHotels('delhi', offer(100), older), false);
  } finally {
    redis.disconnect();
    const stopped = new Promise(resolve => server.once('exit', resolve));
    server.kill('SIGTERM');
    await stopped;
    rmSync(dir, { recursive: true, force: true });
  }
});
