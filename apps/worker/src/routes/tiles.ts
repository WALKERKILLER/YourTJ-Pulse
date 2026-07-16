import { Hono } from 'hono';

import type { WorkerEnv } from '../types';
import { serveR2Object } from '../services/r2';

export const tilesRouter = new Hono<WorkerEnv>();

tilesRouter.get('/*', (context) => {
  const prefix = '/tiles/';
  const prefixIndex = context.req.path.indexOf(prefix);
  const key = prefixIndex === -1 ? '' : context.req.path.slice(prefixIndex + prefix.length);
  if (key.length === 0) return context.notFound();
  return serveR2Object(context, key);
});
