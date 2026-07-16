import { API_LIMITS, featureSchema, submitFeatureSchema, type GeoJsonFeature } from '@yourtj/contracts';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { z } from 'zod';

import { authenticate } from '../auth/middleware';
import { requireRole } from '../auth/roles';
import { authenticateToken, bearerToken } from '../auth/session';
import { claimSubmissionReview, releaseSubmissionReview, syncAuthenticatedUser } from '../repositories/business';
import {
  finalizeSubmissionFeatureRevisions,
  recordSubmissionFeatureRevisions,
} from '../repositories/feature-revisions';
import {
  createSubmission,
  getSubmission,
  listPendingSubmissions,
  reviewSubmission,
} from '../repositories/submissions';
import type { WorkerEnv } from '../types';
import { parseJsonBody } from '../utils/body';
import { ApiError, jsonData } from '../utils/responses';

const reviewSchema = z
  .object({
    action: z.enum(['apply', 'reject']),
    message: z.string().trim().max(500).optional(),
    features: z.array(featureSchema).min(1).max(API_LIMITS.featuresPerSubmission).optional(),
  })
  .strict();

const reviewMessageSchema = z
  .object({
    message: z.string().trim().max(500).optional(),
    features: z.array(featureSchema).min(1).max(API_LIMITS.featuresPerSubmission).optional(),
  })
  .strict();

export const submissionsRouter = new Hono<WorkerEnv>();

function submissionId(context: Context<WorkerEnv>) {
  const id = context.req.param('id');
  if (id === undefined || id.length === 0) {
    throw new ApiError(400, 'INVALID_SUBMISSION_ID', 'Submission id is required');
  }
  return id;
}

submissionsRouter.post('/submit', async (context) => {
  const input = await parseJsonBody(context.req.raw, submitFeatureSchema);
  const token = bearerToken(context.req.header('Authorization'));
  const actor = token ? authenticateToken(token, context.env) : undefined;
  if (token && !actor) throw new ApiError(401, 'INVALID_ACCESS_TOKEN', 'Access token is invalid or expired');
  const submission = await createSubmission(context.env.TILES, input, actor?.id);
  if (actor) {
    await syncAuthenticatedUser(context.env.DB, actor);
    await recordSubmissionFeatureRevisions(context.env.DB, actor, submission.id, submission.features);
  }
  return context.json({ ok: true, id: submission.id, count: submission.count });
});

async function listData(context: Context<WorkerEnv>) {
  return listPendingSubmissions(context.env.TILES);
}

async function detailData(context: Context<WorkerEnv>) {
  const submission = await getSubmission(context.env.TILES, submissionId(context));
  if (submission === undefined) {
    throw new ApiError(404, 'SUBMISSION_NOT_FOUND', 'Submission was not found');
  }
  return submission;
}

async function reviewWithAudit(
  context: Context<WorkerEnv>,
  id: string,
  action: 'apply' | 'reject',
  message?: string,
  features?: GeoJsonFeature[],
) {
  const reviewer = context.get('user');
  await claimSubmissionReview(context.env.DB, reviewer.id, id, action);
  try {
    const result = await reviewSubmission(context.env.TILES, id, action, reviewer, message, features);
    await finalizeSubmissionFeatureRevisions(context.env.DB, id, reviewer, action, message);
    return result;
  } catch (error) {
    try {
      await releaseSubmissionReview(context.env.DB, id);
    } catch (releaseError) {
      console.error('Failed to release submission review claim', releaseError);
    }
    throw error;
  }
}

submissionsRouter.get(
  '/submissions',
  authenticate,
  requireRole('moderator', 'admin'),
  async (context) => context.json(await listData(context)),
);
submissionsRouter.get(
  '/submissions/:id',
  authenticate,
  requireRole('moderator', 'admin'),
  async (context) => context.json(await detailData(context)),
);
submissionsRouter.post(
  '/submissions/:id',
  authenticate,
  requireRole('moderator', 'admin'),
  async (context) => {
    const input = await parseJsonBody(context.req.raw, reviewSchema);
    const result = await reviewWithAudit(context, submissionId(context), input.action, input.message,
      input.action === 'apply' ? input.features : undefined);
    return context.json({ ok: true, ...result });
  },
);

export const adminSubmissionsRouter = new Hono<WorkerEnv>();
adminSubmissionsRouter.use('*', authenticate, requireRole('moderator', 'admin'));
adminSubmissionsRouter.get('/', async (context) => jsonData(context, await listData(context)));
adminSubmissionsRouter.get('/:id', async (context) => jsonData(context, await detailData(context)));
adminSubmissionsRouter.post('/:id/apply', async (context) => {
  const input = await parseJsonBody(context.req.raw, reviewMessageSchema);
  const id = submissionId(context);
  const result = await reviewWithAudit(context, id, 'apply', input.message, input.features);
  return jsonData(context, result);
});
adminSubmissionsRouter.post('/:id/reject', async (context) => {
  const input = await parseJsonBody(context.req.raw, reviewMessageSchema);
  const id = submissionId(context);
  const result = await reviewWithAudit(context, id, 'reject', input.message);
  return jsonData(context, result);
});
