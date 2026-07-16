import { Hono } from 'hono';

import type { WorkerEnv } from '../types';

/** Route boundary reserved for collaborative pins introduced in TASK-403. */
export const pinsRouter = new Hono<WorkerEnv>();
