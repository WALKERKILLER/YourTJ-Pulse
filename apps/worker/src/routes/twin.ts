import { createTwinEventSchema, generateTwinMovementPlanSchema, updateTwinProfileSchema } from '@yourtj/contracts';
import { Hono } from 'hono';

import { authenticate } from '../auth/middleware';
import {
  createTwinEvent,
  getTwinProfile,
  listTwinEvents,
  updateTwinProfile,
} from '../repositories/business';
import type { WorkerEnv } from '../types';
import { parseJsonBody } from '../utils/body';
import { jsonData } from '../utils/responses';
import { assertTwinPlaceId, cancelTwinMovementPlan, generateTwinMovementPlan, listTwinMovementPlans } from '../repositories/twin';

export const twinRouter = new Hono<WorkerEnv>();

twinRouter.use('*', authenticate);
twinRouter.get('/profile', async (context) =>
  jsonData(context, await getTwinProfile(context.env.DB, context.get('user').id)));
twinRouter.patch('/profile', async (context) => {
  const input = await parseJsonBody(context.req.raw, updateTwinProfileSchema);
  assertTwinPlaceId(input.homePlaceId, 'homePlaceId');
  return jsonData(context, await updateTwinProfile(context.env.DB, context.get('user'), input));
});
twinRouter.get('/events', async (context) =>
  jsonData(context, await listTwinEvents(context.env.DB, context.get('user').id)));
twinRouter.post('/events', async (context) => {
  const input = await parseJsonBody(context.req.raw, createTwinEventSchema);
  assertTwinPlaceId(input.originPlaceId, 'originPlaceId');
  assertTwinPlaceId(input.destinationPlaceId, 'destinationPlaceId');
  return jsonData(context, await createTwinEvent(context.env.DB, context.get('user'), input), 201);
});
twinRouter.get('/plans', async (context) =>
  jsonData(context, await listTwinMovementPlans(context.env.DB, context.get('user').id)));
twinRouter.post('/plans', async (context) => {
  const input = await parseJsonBody(context.req.raw, generateTwinMovementPlanSchema);
  return jsonData(context, await generateTwinMovementPlan(context.env.DB, context.get('user'), input), 201);
});
twinRouter.delete('/plans/:planId', async (context) =>
  jsonData(context, await cancelTwinMovementPlan(context.env.DB, context.get('user'), context.req.param('planId'))));
