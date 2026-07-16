import type { MiddlewareHandler } from 'hono';

import type { WorkerEnv } from '../types';
import { syncAuthenticatedUser } from '../repositories/business';
import { jsonError } from '../utils/responses';
import { authenticateToken, bearerToken, developmentUser } from './session';

export const authenticate: MiddlewareHandler<WorkerEnv> = async (context, next) => {
  const token = bearerToken(context.req.header('Authorization'));
  const user = token === undefined ? developmentUser(context.env) : authenticateToken(token, context.env);
  if (token === undefined && user === undefined) {
    return jsonError(context, 401, 'UNAUTHENTICATED', 'Authentication is required');
  }
  if (user === undefined) {
    return jsonError(context, 401, 'INVALID_ACCESS_TOKEN', 'Access token is invalid or expired');
  }

  await syncAuthenticatedUser(context.env.DB, user);
  context.set('user', user);
  await next();
};
