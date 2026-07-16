import { API_LIMITS } from '@yourtj/contracts';
import type { z } from 'zod';

import { ApiError } from './responses';

export async function readJsonBody(request: Request): Promise<unknown> {
  const contentLength = request.headers.get('content-length');
  if (contentLength !== null && Number(contentLength) > API_LIMITS.requestBytes) {
    throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
  }

  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > API_LIMITS.requestBytes) {
    throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
  }

  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ApiError(400, 'INVALID_JSON', 'Request body must be valid JSON');
  }
}

export async function parseJsonBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const value = await readJsonBody(request);
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Request body failed validation', {
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
  return result.data;
}
