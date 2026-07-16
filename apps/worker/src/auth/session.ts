import { authenticatedUserSchema } from '@yourtj/contracts';
import { z } from 'zod';

import type { WorkerBindings } from '../types';

const credentialSchema = z
  .object({
    token: z.string().min(32).max(512),
    user: authenticatedUserSchema,
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
  if (env.AUTH_TOKENS_JSON === undefined) return undefined;

  let credentials: z.infer<typeof credentialsSchema>;
  try {
    credentials = credentialsSchema.parse(JSON.parse(env.AUTH_TOKENS_JSON));
  } catch {
    console.error('AUTH_TOKENS_JSON is not a valid credential configuration');
    return undefined;
  }

  return credentials.find((credential) => constantTimeEqual(credential.token, token))?.user;
}
