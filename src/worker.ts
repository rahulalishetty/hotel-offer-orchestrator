import { env } from './config/env.config';
import { NativeConnection, Runtime, Worker } from '@temporalio/worker';
import * as activities from './activities/supplier.activities';
import * as redisActivities from './activities/redis.activities';
import { logger } from './config/logging.config';
import { redis, closeRedis } from './config/db.config';
import { runService } from './utils/shutdown.utils';

let connection: NativeConnection | undefined;
let worker: Worker | undefined;
let workerRun: Promise<void> | undefined;

runService({
  name: 'Temporal worker',
  timeoutMs: env.shutdownTimeoutMs,
  async start(shutdown) {
    // One owner for signal handling and the overall shutdown deadline.
    Runtime.install({ shutdownSignals: [] });
    connection = await NativeConnection.connect({ address: env.temporalAddress });
    await redis.connect();
    worker = await Worker.create({
      connection,
      namespace: env.temporalNamespace,
      taskQueue: env.temporalTaskQueue,
      workflowsPath: require.resolve('./workflows/hotel.workflow'),
      activities: { ...activities, ...redisActivities },
      shutdownGraceTime: Math.floor(env.shutdownTimeoutMs * 0.8),
    });
    workerRun = worker.run();
    void workerRun.then(() => { void shutdown(); }, error => { void shutdown(error); });
    logger.info({ address: env.temporalAddress }, 'Temporal worker started');
  },
  async drain() {
    if (worker?.getState() === 'RUNNING') worker.shutdown();
    await workerRun;
  },
  close: [
    async () => { await connection?.close(); },
    closeRedis,
  ],
  forceClose() { redis.disconnect(); },
});
