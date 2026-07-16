import type { AuthenticatedUser } from '@yourtj/contracts';

export interface WorkerBindings {
  ASSETS: Fetcher;
  APP_ENV?: string;
  DB: D1Database;
  TILES: R2Bucket;
  AUTH_TOKENS_JSON?: string;
  CORS_ORIGINS?: string;
  DEV_AUTH_ENABLED?: string;
  DEV_USER_AVATAR_URL?: string;
  DEV_USER_DISPLAY_NAME?: string;
  DEV_USER_ID?: string;
  DEV_USER_ROLE?: string;
  TRUSTED_SESSION_TOKENS_JSON?: string;
}

export interface WorkerVariables {
  user: AuthenticatedUser;
}

export interface WorkerEnv {
  Bindings: WorkerBindings;
  Variables: WorkerVariables;
}
