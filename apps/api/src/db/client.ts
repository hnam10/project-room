import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNodeEngines } from '@surrealdb/node';
import { Surreal, createRemoteEngines } from 'surrealdb';
import { config, isEmbedded } from '../config.js';

let db: Surreal | null = null;

/** The shared SurrealDB connection. Call connectDb() once at startup before using it. */
export function getDb(): Surreal {
  if (!db) throw new Error('Database not connected — call connectDb() first');
  return db;
}

export async function connectDb(url = config.surrealUrl): Promise<Surreal> {
  const instance = new Surreal({ engines: { ...createRemoteEngines(), ...createNodeEngines() } });

  const filePath = url.match(/^(?:surrealkv|rocksdb)(?:\+versioned)?:\/\/(.+)$/)?.[1];
  if (filePath) await mkdir(path.dirname(path.resolve(filePath)), { recursive: true });

  const remoteAuth =
    !isEmbedded && config.surrealUser && config.surrealPass
      ? { authentication: { username: config.surrealUser, password: config.surrealPass } }
      : {};
  await instance.connect(url, { namespace: config.surrealNamespace, database: config.surrealDatabase, ...remoteAuth });
  await instance.use({ namespace: config.surrealNamespace, database: config.surrealDatabase });
  await applySchema(instance);

  db = instance;
  return instance;
}

export async function closeDb(): Promise<void> {
  await db?.close();
  db = null;
}

async function applySchema(instance: Surreal): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const schema = await readFile(path.join(here, 'schema.surql'), 'utf8');
  await instance.query(schema).collect();
}
