import { Hono } from 'hono';

import type { WorkerEnv } from '../types';

/** Route boundary reserved for the D1-backed room API introduced in TASK-403. */
export const roomsRouter = new Hono<WorkerEnv>();
