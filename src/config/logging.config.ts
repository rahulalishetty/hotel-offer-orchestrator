import pino from 'pino';
import { env } from './env.config';

export const logger = pino({
  level: env.logLevel,
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
});
