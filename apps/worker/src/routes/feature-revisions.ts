import { Hono } from 'hono';
import { z } from 'zod';

import { authenticate } from '../auth/middleware';
import { listFeatureRevisions } from '../repositories/feature-revisions';
import type { WorkerEnv } from '../types';
import { parseQuery } from '../utils/params';
import { jsonData } from '../utils/responses';

const querySchema = z.object({
  submissionId: z.string().trim().min(1).max(128).optional(),
}).strict();

export const featureRevisionsRouter = new Hono<WorkerEnv>();

featureRevisionsRouter.use('*', authenticate);
featureRevisionsRouter.get('/', async (context) => jsonData(
  context,
  await listFeatureRevisions(
    context.env.DB,
    context.get('user'),
    parseQuery(context, querySchema).submissionId,
  ),
));
