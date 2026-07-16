import { Hono } from 'hono';

import type { WorkerEnv } from '../types';

/** Route boundary reserved for Durable Object WebSockets introduced in TASK-501. */
export const realtimeRouter = new Hono<WorkerEnv>();
