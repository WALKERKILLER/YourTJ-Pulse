import { Hono } from 'hono';

import { authenticateSession, developmentUser } from '../auth/session';
import { getRoom, syncAuthenticatedUser } from '../repositories/business';
import type { WorkerEnv } from '../types';
import { identifierParam } from '../utils/params';
import { ApiError } from '../utils/responses';

export const REALTIME_PROTOCOL = 'yourtj.realtime.v1';
const AUTH_PROTOCOL_PREFIX = 'yourtj.auth.';

function decodeBase64Url(value: string): string | undefined {
  try {
    const normalized = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
    const binary = atob(normalized);
    return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
  } catch {
    return undefined;
  }
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function offeredProtocols(header: string | undefined): string[] {
  return header?.split(',').map((protocol) => protocol.trim()).filter(Boolean) ?? [];
}

export const realtimeRouter = new Hono<WorkerEnv>();

realtimeRouter.get('/rooms/:roomId', async (context) => {
  if (context.req.header('Upgrade')?.toLowerCase() !== 'websocket') {
    throw new ApiError(426, 'WEBSOCKET_UPGRADE_REQUIRED', 'A WebSocket upgrade is required');
  }
  const protocols = offeredProtocols(context.req.header('Sec-WebSocket-Protocol'));
  if (!protocols.includes(REALTIME_PROTOCOL)) {
    throw new ApiError(400, 'REALTIME_PROTOCOL_REQUIRED', `WebSocket protocol ${REALTIME_PROTOCOL} is required`);
  }
  const encodedToken = protocols.find((protocol) => protocol.startsWith(AUTH_PROTOCOL_PREFIX))?.slice(AUTH_PROTOCOL_PREFIX.length);
  const token = encodedToken ? decodeBase64Url(encodedToken) : undefined;
  const session = token ? authenticateSession(token, context.env) : undefined;
  const user = session?.user ?? (!token ? developmentUser(context.env) : undefined);
  if (!user) throw new ApiError(401, token ? 'INVALID_ACCESS_TOKEN' : 'UNAUTHENTICATED', 'A valid realtime session is required');

  await syncAuthenticatedUser(context.env.DB, user);
  const roomId = identifierParam(context, 'roomId');
  const room = await getRoom(context.env.DB, roomId, user);
  const elevated = user.roles.includes('moderator') || user.roles.includes('admin');
  if (!room.membershipRole && !elevated) {
    throw new ApiError(403, 'ROOM_MEMBERSHIP_REQUIRED', 'Join the room before opening its realtime channel');
  }

  const identity = encodeBase64Url(JSON.stringify({
    user,
    sessionExpiresAt: session?.expiresAt ?? null,
  }));
  const headers = new Headers({
    Upgrade: 'websocket',
    'Sec-WebSocket-Protocol': REALTIME_PROTOCOL,
    'X-YourTJ-Realtime-Identity': identity,
    'X-YourTJ-Room-Id': roomId,
  });
  if (room.expiresAt) headers.set('X-YourTJ-Room-Expires-At', room.expiresAt);
  const stub = context.env.ROOMS.getByName(`room:${roomId}`);
  return stub.fetch(new Request('https://room.internal/connect', { headers }));
});
