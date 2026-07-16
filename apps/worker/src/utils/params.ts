import type { Context } from 'hono';
import type { z } from 'zod';

import type { WorkerEnv } from '../types';
import { ApiError } from './responses';

export function identifierParam(context: Context<WorkerEnv>, name = 'id'): string {
  const value = context.req.param(name);
  if (!value || value.length > 128 || !/^[\w:.-]+$/.test(value)) {
    throw new ApiError(400, 'INVALID_IDENTIFIER', `${name} is invalid`);
  }
  return value;
}

export function parseQuery<T>(context: Context<WorkerEnv>, schema: z.ZodType<T>): T {
  const result = schema.safeParse(Object.fromEntries(new URL(context.req.url).searchParams));
  if (!result.success) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Query parameters failed validation', {
      issues: result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
  }
  return result.data;
}
