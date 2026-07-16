import type { UserRole } from '@yourtj/contracts';
import type { MiddlewareHandler } from 'hono';

import type { WorkerEnv } from '../types';
import { jsonError } from '../utils/responses';

export function requireRole(...allowedRoles: UserRole[]): MiddlewareHandler<WorkerEnv> {
  return async (context, next) => {
    const user = context.get('user');
    if (!allowedRoles.some((role) => user.roles.includes(role))) {
      return jsonError(context, 403, 'FORBIDDEN', 'This action requires an elevated role');
    }
    await next();
  };
}
