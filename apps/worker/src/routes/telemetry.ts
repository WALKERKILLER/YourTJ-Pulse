import { clientTelemetrySchema } from '@yourtj/contracts';
import { Hono } from 'hono';

import { observe } from '../observability';
import type { WorkerEnv } from '../types';
import { parseJsonBody } from '../utils/body';
import { jsonData } from '../utils/responses';

export const telemetryRouter = new Hono<WorkerEnv>();

telemetryRouter.post('/', async (context) => {
  const telemetry = await parseJsonBody(context.req.raw, clientTelemetrySchema);
  observe({
    event: telemetry.event,
    result: telemetry.result === 'recovered' ? 'ok' : 'error',
    ...(telemetry.durationMs === undefined ? {} : { durationMs: telemetry.durationMs }),
  });
  return jsonData(context, { accepted: true }, 202);
});
