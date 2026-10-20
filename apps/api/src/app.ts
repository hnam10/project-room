import express from 'express';
import { requireProjectMember } from './http/context.js';
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
  app.use(errorHandler);
  return app;
}
