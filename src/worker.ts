import { env } from './config/env.config';
import { NativeConnection, Worker } from '@temporalio/worker';
import * as activities from './activities/supplier.activities';
import * as redisActivities from './activities/redis.activities';
import { logger } from './config/logging.config';

async function run(): Promise<void> {
  const address = env.temporalAddress;
  const connection = await NativeConnection.connect({ address });

  const worker = await Worker.create({
    connection,
    namespace: env.temporalNamespace,
    taskQueue: env.temporalTaskQueue,
    workflowsPath: require.resolve('./workflows/hotel.workflow'),
    activities: { ...activities, ...redisActivities },
  });

  logger.info({ address }, 'Temporal worker started');
  await worker.run();
}

run().catch((error) => {
  logger.error({ err: error }, 'Temporal worker stopped unexpectedly');
  process.exit(1);
});
