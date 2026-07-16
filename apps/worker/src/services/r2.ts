import type { Context } from 'hono';

import type { WorkerEnv } from '../types';
import { jsonError } from '../utils/responses';

function objectHeaders(object: R2Object) {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('ETag', object.httpEtag);
  headers.set('Cache-Control', 'public, max-age=86400');
  headers.set('Accept-Ranges', 'bytes');
  return headers;
}

export async function serveR2Object(context: Context<WorkerEnv>, key: string) {
  const object = await context.env.TILES.get(key);
  if (object === null) {
    return jsonError(context, 404, 'OBJECT_NOT_FOUND', 'Requested object was not found');
  }

  const headers = objectHeaders(object);
  const rangeHeader = context.req.header('Range');
  if (rangeHeader === undefined) return new Response(object.body, { headers });

  const match = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader);
  if (match === null) {
    headers.set('Content-Range', `bytes */${object.size}`);
    return new Response(null, { status: 416, headers });
  }

  const start = Number(match[1]);
  const requestedEnd = match[2] === '' ? object.size - 1 : Number(match[2]);
  const end = Math.min(requestedEnd, object.size - 1);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= object.size) {
    headers.set('Content-Range', `bytes */${object.size}`);
    return new Response(null, { status: 416, headers });
  }

  const partial = await context.env.TILES.get(key, {
    range: { offset: start, length: end - start + 1 },
  });
  if (partial === null) {
    headers.set('Content-Range', `bytes */${object.size}`);
    return new Response(null, { status: 416, headers });
  }

  headers.set('Content-Range', `bytes ${start}-${end}/${object.size}`);
  headers.set('Content-Length', String(end - start + 1));
  return new Response(partial.body, { status: 206, headers });
}
