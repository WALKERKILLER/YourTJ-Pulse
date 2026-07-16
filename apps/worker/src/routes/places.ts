import { Hono } from 'hono';

import type { WorkerEnv } from '../types';
import { serveR2Object } from '../services/r2';

export const placesRouter = new Hono<WorkerEnv>();

placesRouter.get('/custom-data', (context) => serveR2Object(context, 'data/custom.geojson'));
