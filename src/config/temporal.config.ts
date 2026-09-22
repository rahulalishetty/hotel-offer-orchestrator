import { Client, Connection } from '@temporalio/client';
import { env } from './env.config';

export async function createTemporalClient(): Promise<Client> {
  const connection = await Connection.connect({ address: env.temporalAddress });
  return new Client({ connection, namespace: env.temporalNamespace });
}
