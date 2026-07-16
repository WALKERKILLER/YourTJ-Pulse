import { Hono } from 'hono';

import { authenticate } from '../auth/middleware';
import type { WorkerEnv } from '../types';
import { jsonData } from '../utils/responses';

export const sessionRouter = new Hono<WorkerEnv>();

sessionRouter.get('/me', authenticate, (context) => jsonData(context, context.get('user')));
