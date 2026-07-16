import { createRoomSchema } from '@yourtj/contracts';
import { Hono } from 'hono';

import { authenticate } from '../auth/middleware';
import { createRoom, deleteRoom, getRoom, joinRoom, leaveRoom } from '../repositories/business';
import type { WorkerEnv } from '../types';
import { parseJsonBody } from '../utils/body';
import { identifierParam } from '../utils/params';
import { jsonData } from '../utils/responses';

export const roomsRouter = new Hono<WorkerEnv>();

roomsRouter.use('*', authenticate);
roomsRouter.post('/', async (context) => {
  const input = await parseJsonBody(context.req.raw, createRoomSchema);
  return jsonData(context, await createRoom(context.env.DB, context.get('user'), input), 201);
});
roomsRouter.get('/:id', async (context) =>
  jsonData(context, await getRoom(context.env.DB, identifierParam(context), context.get('user'))));
roomsRouter.post('/:id/join', async (context) =>
  jsonData(context, await joinRoom(context.env.DB, identifierParam(context), context.get('user'))));
roomsRouter.post('/:id/leave', async (context) => {
  await leaveRoom(context.env.DB, identifierParam(context), context.get('user'));
  return jsonData(context, { left: true });
});
roomsRouter.delete('/:id', async (context) => {
  await deleteRoom(context.env.DB, identifierParam(context), context.get('user'));
  return jsonData(context, { deleted: true });
});
