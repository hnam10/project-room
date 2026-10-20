// Runtime configuration, read once from environment variables (see apps/api/.env.example).

function env(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

export const config = {
  port: Number(env('PORT', '4000')),
  /**
   * Where SurrealDB lives. Embedded engines need no server:
   *   mem://                      in-memory, wiped on restart
   *   surrealkv://./data/dev.db   on-disk file (default)
   * Remote server: ws://127.0.0.1:8000 (run `surreal start`).
   */
  surrealUrl: env('SURREAL_URL', 'surrealkv://./data/dev.db'),
  surrealNamespace: env('SURREAL_NS', 'project_room'),
  surrealDatabase: env('SURREAL_DB', 'dev'),
  surrealUser: process.env.SURREAL_USER || null,
  surrealPass: process.env.SURREAL_PASS || null,
  /** Seed demo data on startup when the database has no projects. */
  seedWhenEmpty: env('SEED_WHEN_EMPTY', 'true') === 'true',
  /** Only "mock" exists today. See src/ai/index.ts for adding a real provider. */
  aiProvider: env('AI_PROVIDER', 'mock'),
} as const;

export const isEmbedded = !/^(wss?|https?):\/\//.test(config.surrealUrl);
