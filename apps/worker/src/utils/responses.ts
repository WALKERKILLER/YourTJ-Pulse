import type { ApiResponse } from '@yourtj/contracts';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import type { WorkerEnv } from '../types';

export class ApiError extends Error {
  constructor(
    public readonly status: ContentfulStatusCode,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function jsonData<T>(
  context: Context<WorkerEnv>,
  data: T,
  status: ContentfulStatusCode = 200,
) {
  return context.json<ApiResponse<T>>({ data }, status);
}

export function jsonError(
  context: Context<WorkerEnv>,
  status: ContentfulStatusCode,
  code: string,
  message: string,
  details?: unknown,
) {
  const error = details === undefined ? { code, message } : { code, message, details };
  return context.json<ApiResponse<never>>({ error }, status);
}
