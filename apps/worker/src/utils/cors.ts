import type { MiddlewareHandler } from 'hono';

import type { WorkerEnv } from '../types';
import { jsonError } from './responses';

function configuredOrigins(value: string | undefined) {
  return new Set(
    (value ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

export const enforceCors: MiddlewareHandler<WorkerEnv> = async (context, next) => {
  const origin = context.req.header('Origin');
  if (origin === undefined) {
    await next();
    return;
  }

  const sameOrigin = origin === new URL(context.req.url).origin;
  const allowed = sameOrigin || configuredOrigins(context.env.CORS_ORIGINS).has(origin);
  if (!allowed) {
    return jsonError(context, 403, 'CORS_ORIGIN_DENIED', 'Request origin is not allowed');
  }

  if (context.req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, Range',
        'Access-Control-Allow-Methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
        Vary: 'Origin',
      },
    });
  }

  await next();
  context.header('Access-Control-Allow-Origin', origin);
  context.header('Access-Control-Allow-Credentials', 'true');
  context.header('Access-Control-Expose-Headers', 'Accept-Ranges, Content-Range, ETag');
  context.header('Vary', 'Origin', { append: true });
};
