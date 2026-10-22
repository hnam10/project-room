import { createServer } from 'node:http';
import { createApp } from './app.js';
import { authMode, config } from './config.js';
import { closeDb, connectDb } from './db/client.js';
import { seedDemoData } from './db/seed.js';
import { getAiProvider } from './ai/index.js';
import { getProject } from './repositories/projects.js';
import { startRealtime } from './realtime/hub.js';
import { startMeetingClock } from './services/meetings.js';

// There is no anonymous mode: without Clerk keys anyone could act as anyone, so don't start at all.
if (authMode !== 'clerk') {
  console.error('Set CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY in apps/api/.env (see .env.example). The API needs Clerk to start.');
  process.exit(1);
}

const db = await connectDb();
if (config.seedOrgId && !(await getProject(config.seedOrgId))) {
  await seedDemoData({ projectId: config.seedOrgId });
  console.log(`Seeded demo project into Clerk organization ${config.seedOrgId}`);
}

const server = createServer(createApp());
const realtime = await startRealtime(server, db);
const stopClock = startMeetingClock();

server.listen(config.port, () => {
  const ai = getAiProvider();
  console.log(
    `Project Room API on http://localhost:${config.port} (db: ${config.surrealUrl}, ai: ${ai.name}${ai.isMock ? ' — set ANTHROPIC_API_KEY for Claude' : ''})`,
  );
});

async function shutdown() {
  stopClock();
  await realtime.close();
  server.close();
  await closeDb();
  process.exit(0);
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
