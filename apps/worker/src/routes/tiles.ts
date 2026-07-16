import { Hono } from 'hono';

import type { WorkerEnv } from '../types';
import { readPmtilesVectorTile } from '../services/pmtiles';
import { serveR2Object } from '../services/r2';
import { observe } from '../observability';

export const tilesRouter = new Hono<WorkerEnv>();

tilesRouter.get('/campus/:z/:x/:y.pbf', async (context) => {
  const z = Number.parseInt(context.req.param('z') ?? '', 10);
  const x = Number.parseInt(context.req.param('x') ?? '', 10);
  const y = Number.parseInt(context.req.param('y') ?? '', 10);
  const dimension = 2 ** z;
  if (
    ![z, x, y].every(Number.isSafeInteger)
    || z < 0
    || z > 24
    || x < 0
    || y < 0
    || x >= dimension
    || y >= dimension
  ) {
    return context.notFound();
  }
  const startedAt = performance.now();
  try {
    const tile = await readPmtilesVectorTile(context.env.TILES, 'tongji.pmtiles', z, x, y);
    observe({
      event: 'pmtiles.request',
      result: tile ? 'ok' : 'rejected',
      durationMs: performance.now() - startedAt,
      status: tile ? 200 : 404,
      route: '/tiles/campus/:z/:x/:y.pbf',
    });
    if (!tile) return context.notFound();
    return new Response(tile.data, {
      headers: {
        'Cache-Control': tile.cacheControl ?? 'public, max-age=86400, stale-while-revalidate=604800',
        'Content-Type': 'application/vnd.mapbox-vector-tile',
      },
    });
  } catch (error) {
    observe({
      event: 'pmtiles.request',
      result: 'error',
      durationMs: performance.now() - startedAt,
      status: 500,
      route: '/tiles/campus/:z/:x/:y.pbf',
    });
    throw error;
  }
});

tilesRouter.get('/*', (context) => {
  const prefix = '/tiles/';
  const prefixIndex = context.req.path.indexOf(prefix);
  const key = prefixIndex === -1 ? '' : context.req.path.slice(prefixIndex + prefix.length);
  if (key.length === 0) return context.notFound();
  return serveR2Object(context, key);
});
