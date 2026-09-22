import type { Server } from 'node:http';
import type { Client } from '@temporalio/client';
import { createApp } from './app';
import { redis, closeRedis } from './config/db.config';
import { env } from './config/env.config';
import { logger } from './config/logging.config';
import { createTemporalClient } from './config/temporal.config';
import { createHotelService } from './services/hotel.service';
import { runService } from './utils/shutdown.utils';

let server: Server | undefined;
let temporalClient: Client | undefined;

runService({
  name: 'API',
  timeoutMs: env.shutdownTimeoutMs,
  async start() {
    temporalClient = await createTemporalClient();
    await redis.connect();
    const app = createApp(createHotelService(temporalClient));
    await new Promise<void>((resolve, reject) => {
      server = app.listen(env.port);
      server.once('error', reject);
      server.once('listening', () => {
        server!.off('error', reject);
        resolve();
      });
    });
    logger.info({ port: env.port }, 'Hotel API listening');
  },
  async drain() {
    if (!server?.listening) return;
    const currentServer = server;
    await new Promise<void>((resolve, reject) => {
      currentServer.close(error => error ? reject(error) : resolve());
      currentServer.closeIdleConnections();
    });
  },
  close: [
    async () => { await temporalClient?.connection.close(); },
    closeRedis,
  ],
  forceClose() {
    server?.closeAllConnections();
    redis.disconnect();
  },
});
