import { createApp } from "./app";
import { redis } from "./config/db.config";
import { env } from "./config/env.config";
import { logger } from "./config/logging.config";
import { createTemporalClient } from "./config/temporal.config";
import { createHotelService } from "./services/hotel.service";

async function start(): Promise<void> {
  const temporalClient = await createTemporalClient();
  await redis.connect();
  const app = createApp(createHotelService(temporalClient));

  // start the server to listen for requests inside a promise to handle errors occured
  // in the following .catch block or else the error will be ignored
  await new Promise<void>((resolve, reject) => {
    app.listen(env.port, (error?: Error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  logger.info({ port: env.port }, "Hotel API listening");
}

start().catch((error) => {
  logger.error({ err: error }, "API failed to start");
  process.exit(1);
});
