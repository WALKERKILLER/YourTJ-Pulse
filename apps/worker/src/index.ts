import { Hono } from 'hono';

import { placesRouter } from './routes/places';
import { cleanupExpiredCollaborationData } from './repositories/business';
import { featureRevisionsRouter } from './routes/feature-revisions';
import { pinsRouter } from './routes/pins';
import { realtimeRouter } from './routes/realtime';
import { roomsRouter } from './routes/rooms';
import { sessionRouter } from './routes/session';
import { adminSubmissionsRouter, submissionsRouter } from './routes/submissions';
import { tilesRouter } from './routes/tiles';
import { telemetryRouter } from './routes/telemetry';
import { twinRouter } from './routes/twin';
import { observe } from './observability';
import type { WorkerBindings, WorkerEnv } from './types';
import { enforceCors } from './utils/cors';
import { ApiError, jsonError } from './utils/responses';

export { RoomDurableObject } from './durable-objects/room';

export function createApp() {
  const app = new Hono<WorkerEnv>();
  const apiRouter = new Hono<WorkerEnv>();

  app.use('*', enforceCors);
  app.use('*', async (context, next) => {
    const startedAt = performance.now();
    await next();
    observe({
      event: 'api.request',
      result: context.res.status >= 500 ? 'error' : context.res.status >= 400 ? 'rejected' : 'ok',
      durationMs: performance.now() - startedAt,
      status: context.res.status,
      route: context.req.path,
    });
  });

  apiRouter.route('/', placesRouter);
  apiRouter.route('/', sessionRouter);
  apiRouter.route('/', submissionsRouter);
  apiRouter.route('/feature-revisions', featureRevisionsRouter);
  apiRouter.route('/rooms', roomsRouter);
  apiRouter.route('/pins', pinsRouter);
  apiRouter.route('/realtime', realtimeRouter);
  apiRouter.route('/telemetry', telemetryRouter);
  apiRouter.route('/twin', twinRouter);
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
    observe({ event: 'worker.error', result: 'error', status: 500, route: context.req.path });
    return jsonError(context, 500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  });

  return app;
}

const app = createApp();

export default {
  fetch: app.fetch,
  scheduled(_controller, env, context) {
    context.waitUntil(cleanupExpiredCollaborationData(env.DB));
  },
} satisfies ExportedHandler<WorkerBindings>;
