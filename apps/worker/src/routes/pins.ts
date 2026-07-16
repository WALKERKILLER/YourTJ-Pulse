import {
  createPinCommentSchema,
  createPinSchema,
  pinStatusSchema,
  pinVisibilitySchema,
  updatePinSchema,
} from '@yourtj/contracts';
import { Hono } from 'hono';
import { z } from 'zod';

import { authenticate } from '../auth/middleware';
import {
  createPin,
  createPinComment,
  deletePin,
  getPin,
  listPinComments,
  listPins,
  updatePin,
} from '../repositories/business';
import type { WorkerEnv } from '../types';
import { parseJsonBody } from '../utils/body';
import { identifierParam, parseQuery } from '../utils/params';
import { jsonData } from '../utils/responses';

export const pinsRouter = new Hono<WorkerEnv>();

const pinQuerySchema = z.object({
  roomId: z.string().trim().min(1).max(128).optional(),
  status: pinStatusSchema.optional(),
  visibility: pinVisibilitySchema.optional(),
}).strict();

pinsRouter.use('*', authenticate);
pinsRouter.get('/', async (context) =>
  jsonData(context, await listPins(context.env.DB, context.get('user'), parseQuery(context, pinQuerySchema))));
pinsRouter.post('/', async (context) => {
  const input = await parseJsonBody(context.req.raw, createPinSchema);
  return jsonData(context, await createPin(context.env.DB, context.get('user'), input), 201);
});
pinsRouter.get('/:id', async (context) =>
  jsonData(context, await getPin(context.env.DB, identifierParam(context), context.get('user'))));
pinsRouter.patch('/:id', async (context) => {
  const input = await parseJsonBody(context.req.raw, updatePinSchema);
  return jsonData(context, await updatePin(context.env.DB, identifierParam(context), context.get('user'), input));
});
pinsRouter.delete('/:id', async (context) => {
  await deletePin(context.env.DB, identifierParam(context), context.get('user'));
  return jsonData(context, { deleted: true });
});
pinsRouter.get('/:id/comments', async (context) =>
  jsonData(context, await listPinComments(context.env.DB, identifierParam(context), context.get('user'))));
pinsRouter.post('/:id/comments', async (context) => {
  const input = await parseJsonBody(context.req.raw, createPinCommentSchema);
  return jsonData(context, await createPinComment(context.env.DB, identifierParam(context), context.get('user'), input), 201);
});
