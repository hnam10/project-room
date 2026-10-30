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
  /** Where uploaded file bytes are stored. Metadata stays in SurrealDB. */
  filesDir: env('FILES_DIR', './data/files'),
  /**
   * SurrealDB Agent Memory. All three are required before a PDF, image, or plain-text upload is indexed
   * and before @AI can read passages from it. Unset means files stay download-only.
   */
  agentMemoryEndpoint: process.env.AGENT_MEMORY_ENDPOINT || null,
  agentMemoryApiKey: process.env.AGENT_MEMORY_API_KEY || null,
  agentMemoryContext: process.env.AGENT_MEMORY_CONTEXT || null,
  /** Clerk organization id to load the demo project into on startup, if that project doesn't exist yet. */
  seedOrgId: process.env.SEED_ORG_ID || null,
  /**
   * OpenAI for the longer calls: @AI (including chat brainstorm drafts), Ask the project, and the
   * end-of-meeting summary. AI_PROVIDER=mock forces the mock even when a key is set. Without this key
   * those jobs use Nebius when NEBIUS_API_KEY is set, otherwise the labelled mock.
   * api.openai.com is sent max_completion_tokens; other hosts are sent max_tokens.
   * OPENAI_FAST_MODEL is the live meeting model only when Nebius is not configured.
   */
  openaiApiKey: process.env.OPENAI_API_KEY || null,
  openaiBaseUrl: env('OPENAI_BASE_URL', 'https://api.openai.com/v1'),
  openaiModel: env('OPENAI_MODEL', 'gpt-4.1-mini'),
  openaiFastModel: env('OPENAI_FAST_MODEL', env('OPENAI_MODEL', 'gpt-4.1-mini')),
  /**
   * Nebius Token Factory for the frequent short calls: the open-question check, live meeting ticks,
   * brainstorm classification, board facilitation, and research summaries.
   */
  nebiusApiKey: process.env.NEBIUS_API_KEY || null,
  nebiusBaseUrl: env('NEBIUS_BASE_URL', 'https://api.tokenfactory.nebius.com/v1'),
  nebiusModel: env('NEBIUS_MODEL', 'nvidia/Nemotron-3.5-Super-VL'),
  /** Whisper on Groq (free tier) transcribes meeting audio when set; otherwise browsers use the Web Speech API. */
  groqApiKey: process.env.GROQ_API_KEY || null,
  groqSttModel: env('GROQ_STT_MODEL', 'whisper-large-v3-turbo'),
  /** Tavily grounds brainstorm suggestions in current web results. Without it, brainstorming uses chat context only. */
  tavilyApiKey: process.env.TAVILY_API_KEY || null,
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
