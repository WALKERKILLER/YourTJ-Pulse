import type { MiddlewareHandler } from 'hono';

import type { WorkerEnv } from '../types';
import { jsonError } from '../utils/responses';
import { authenticateToken, bearerToken } from './session';

export const authenticate: MiddlewareHandler<WorkerEnv> = async (context, next) => {
  const token = bearerToken(context.req.header('Authorization'));
  if (token === undefined) {
    return jsonError(context, 401, 'UNAUTHENTICATED', 'Authentication is required');
  }

  const user = authenticateToken(token, context.env);
  if (user === undefined) {
    return jsonError(context, 401, 'INVALID_ACCESS_TOKEN', 'Access token is invalid or expired');
  }

  context.set('user', user);
  await next();
};
