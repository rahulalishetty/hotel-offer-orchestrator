import pinoHttp from 'pino-http';
import { logger } from '../config/logging.config';

export const loggerMiddleware = pinoHttp({ logger });
