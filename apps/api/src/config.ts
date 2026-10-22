// Runtime configuration, read once from environment variables (see apps/api/.env.example).

function env(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function iceServers(): RTCIceServer[] {
  const fallback = [{ urls: 'stun:stun.l.google.com:19302' }];
  const raw = process.env.RTC_ICE_SERVERS;
  if (!raw) return fallback;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as RTCIceServer[];
  } catch {
    // fall through to the warning
  }
  console.warn('RTC_ICE_SERVERS is not a JSON array; using the default STUN server');
  return fallback;
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
  /** Built web app to serve (default: apps/web/dist, if it exists). */
  webDist: process.env.WEB_DIST || null,
  /** Clerk organization id to load the demo project into on startup, if that project doesn't exist yet. */
  seedOrgId: process.env.SEED_ORG_ID || null,
  /** Claude is used whenever ANTHROPIC_API_KEY is set; without it the labelled mock runs. AI_PROVIDER=mock forces the mock. */
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || null,
  anthropicModel: env('ANTHROPIC_MODEL', 'claude-opus-5-5'),
  /** Cheaper, faster model for the live meeting AI that runs every few seconds. */
  anthropicFastModel: env('ANTHROPIC_FAST_MODEL', 'claude-haiku-5-5'),
  /** WebRTC ICE servers handed to meeting clients (STUN/TURN). */
  rtcIceServers: iceServers(),
  forceMockAi: process.env.AI_PROVIDER === 'mock',
  /**
   * Clerk keys. Callers sign in with Clerk and a Clerk Organization is a project. The server refuses to
   * start without them (see index.ts); only the test suite runs without keys, in `dev` auth mode.
   */
  clerkSecretKey: process.env.CLERK_SECRET_KEY || null,
  clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY || null,
} as const;

export const authMode: 'clerk' | 'dev' = config.clerkSecretKey && config.clerkPublishableKey ? 'clerk' : 'dev';

export const isEmbedded = !/^(wss?|https?):\/\//.test(config.surrealUrl);
