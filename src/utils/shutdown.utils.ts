import { logger } from '../config/logging.config';

interface ServiceLifecycle {
  name: string;
  timeoutMs: number;
  start: (shutdown: (error?: unknown) => Promise<void>) => Promise<void>;
  drain: () => Promise<void>;
  close: Array<() => Promise<void>>;
  forceClose: () => void;
}

/** Install handlers before startup; serialize drain/cleanup even for repeated signals. */
export function runService(lifecycle: ServiceLifecycle): void {
  let shutdownPromise: Promise<void> | undefined;
  const report = (error: unknown) => {
    process.exitCode = 1;
    logger.error({ err: error, service: lifecycle.name }, 'Service lifecycle failed');
  };
  const shutdown = (error?: unknown): Promise<void> => {
    if (error !== undefined) report(error);
    if (shutdownPromise) return shutdownPromise;
    logger.info({ service: lifecycle.name }, 'Graceful shutdown started');
    const deadline = setTimeout(() => {
      logger.error({ service: lifecycle.name }, 'Shutdown deadline exceeded; forcing exit');
      try { lifecycle.forceClose(); } finally { process.exit(1); }
    }, lifecycle.timeoutMs);
    shutdownPromise = (async () => {
      // A signal during startup waits for acquired resources to become available.
      try { await startup; } catch { /* Startup failure is reported below. */ }
      try { await lifecycle.drain(); } catch (err) { report(err); }
      // Attempt every close even if an earlier close fails.
      for (const close of lifecycle.close) {
        try { await close(); } catch (err) { report(err); }
      }
      clearTimeout(deadline);
      logger.info({ service: lifecycle.name }, 'Graceful shutdown complete');
    })();
    return shutdownPromise;
  };
  process.on('SIGINT', () => { void shutdown(); });
  process.on('SIGTERM', () => { void shutdown(); });
  const startup = Promise.resolve().then(() => lifecycle.start(shutdown));
  void startup.catch(error => shutdown(error));
}
