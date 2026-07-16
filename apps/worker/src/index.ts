import { Hono } from 'hono';

import { placesRouter } from './routes/places';
import { adminSubmissionsRouter, submissionsRouter } from './routes/submissions';
import { tilesRouter } from './routes/tiles';
import type { WorkerEnv } from './types';
import { enforceCors } from './utils/cors';
import { ApiError, jsonError } from './utils/responses';

export function createApp() {
  const app = new Hono<WorkerEnv>();
  const apiRouter = new Hono<WorkerEnv>();

  app.use('*', enforceCors);

  apiRouter.route('/', placesRouter);
  apiRouter.route('/', submissionsRouter);
  apiRouter.route('/admin/submissions', adminSubmissionsRouter);

  app.route('/api', apiRouter);
  app.route('/tiles', tilesRouter);

  app.all('/api/*', (context) =>
    jsonError(context, 404, 'API_ROUTE_NOT_FOUND', 'API route was not found'),
  );
  app.all('/tiles/*', (context) =>
    jsonError(context, 404, 'TILE_NOT_FOUND', 'Tile object was not found'),
  );
  app.all('*', (context) => context.env.ASSETS.fetch(context.req.raw));

  app.onError((error, context) => {
    if (error instanceof ApiError) {
      return jsonError(context, error.status, error.code, error.message, error.details);
    }
    console.error('Unhandled worker error', error);
    return jsonError(context, 500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  });

  return app;
}

export default createApp();
