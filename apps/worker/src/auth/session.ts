import { authenticatedUserSchema, userRoleSchema, type AuthenticatedUser } from '@yourtj/contracts';
import { z } from 'zod';

import type { WorkerBindings } from '../types';

const credentialSchema = z
  .object({
    token: z.string().min(32).max(512),
    user: authenticatedUserSchema,
    expiresAt: z.iso.datetime().optional(),
  })
  .strict();

const credentialsSchema = z.array(credentialSchema).min(1).max(100);

function constantTimeEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  if (leftBytes.length !== rightBytes.length) return false;

  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index]! ^ rightBytes[index]!;
  }
  return difference === 0;
}

export function bearerToken(authorization: string | undefined) {
  if (authorization === undefined) return undefined;
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
  return match?.[1];
}

export function authenticateToken(token: string, env: WorkerBindings) {
  return authenticateSession(token, env)?.user;
}

export function authenticateSession(token: string, env: WorkerBindings) {
  const configuredCredentials = env.TRUSTED_SESSION_TOKENS_JSON ?? env.AUTH_TOKENS_JSON;
  if (configuredCredentials === undefined) return undefined;

  let credentials: z.infer<typeof credentialsSchema>;
  try {
    credentials = credentialsSchema.parse(JSON.parse(configuredCredentials));
  } catch {
    console.error('Trusted session token configuration is invalid');
    return undefined;
  }

  const credential = credentials.find((candidate) => constantTimeEqual(candidate.token, token));
  if (!credential || (credential.expiresAt && credential.expiresAt <= new Date().toISOString())) return undefined;
  return { user: credential.user, expiresAt: credential.expiresAt };
}

export function developmentUser(env: WorkerBindings): AuthenticatedUser | undefined {
  if (env.APP_ENV !== 'development' || env.DEV_AUTH_ENABLED !== 'true' || !env.DEV_USER_ID) return undefined;
  const roles = (env.DEV_USER_ROLE ?? 'user').split(',').map((role) => role.trim()).filter(Boolean);
  const parsedRoles = z.array(userRoleSchema).min(1).max(4).safeParse(roles);
  if (!parsedRoles.success) {
    console.error('DEV_USER_ROLE contains an unsupported role');
    return undefined;
  }
  const candidate = {
    id: env.DEV_USER_ID,
    displayName: env.DEV_USER_DISPLAY_NAME ?? env.DEV_USER_ID,
    roles: parsedRoles.data,
    ...(env.DEV_USER_AVATAR_URL ? { avatarUrl: env.DEV_USER_AVATAR_URL } : {}),
  };
  const parsed = authenticatedUserSchema.safeParse(candidate);
  return parsed.success ? parsed.data : undefined;
}
