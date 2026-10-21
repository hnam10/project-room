import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { clerkMiddleware } from '@clerk/express';
import { clerk } from './auth/clerk.js';
import { authMode, config } from './config.js';
import { authenticate, requireProjectMember } from './http/context.js';
import { errorHandler, notFoundRoute } from './http/errors.js';
import { decisionsRouter } from './http/routes/decisions.js';
import { ideasRouter } from './http/routes/ideas.js';
import { messagesRouter } from './http/routes/messages.js';
import { meRouter, projectRouter } from './http/routes/projects.js';
import { suggestionsRouter } from './http/routes/suggestions.js';
import { tasksRouter } from './http/routes/tasks.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });
  if (authMode === 'clerk') app.use('/api', clerkMiddleware({ clerkClient: clerk() }));
  app.use('/api', authenticate);
  app.use('/api', meRouter);

  // Everything below is scoped to one project and requires membership.
  const project = express.Router({ mergeParams: true });
  project.use(requireProjectMember);
  project.use('/', projectRouter);
  project.use('/tasks', tasksRouter);
  project.use('/channels', messagesRouter);
  project.use('/ideas', ideasRouter);
  project.use('/decisions', decisionsRouter);
  project.use('/suggestions', suggestionsRouter);
  app.use('/api/projects/:projectId', project);

  app.use('/api', notFoundRoute);

  // Production: one process serves the built web app too, so a single URL is the whole product.
  const webDist = config.webDist ?? fileURLToPath(new URL('../../web/dist', import.meta.url));
  if (existsSync(`${webDist}/index.html`)) {
    app.use(express.static(webDist));
    app.get(/^\/(?!api\/|ws).*/, (_req, res) => res.sendFile('index.html', { root: webDist }));
  }
  app.use(errorHandler);
  return app;
}
