import { createServer } from 'node:http';
import { createApp } from './app.js';
import { config } from './config.js';
import { closeDb, connectDb } from './db/client.js';
import { isDatabaseEmpty, seedDemoData } from './db/seed.js';
import { startRealtime } from './realtime/hub.js';

const db = await connectDb();
if (config.seedWhenEmpty && (await isDatabaseEmpty())) {
  await seedDemoData();
  console.log('Seeded demo project "Hackathon 2026"');
}

const server = createServer(createApp());
const realtime = await startRealtime(server, db);

server.listen(config.port, () => {
  console.log(`Project Room API on http://localhost:${config.port} (db: ${config.surrealUrl}, ai: ${config.aiProvider})`);
});

async function shutdown() {
  await realtime.close();
  server.close();
  await closeDb();
  process.exit(0);
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
