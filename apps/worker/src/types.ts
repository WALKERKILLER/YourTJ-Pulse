import type { AuthenticatedUser } from '@yourtj/contracts';

export interface WorkerBindings {
  ASSETS: Fetcher;
  TILES: R2Bucket;
  AUTH_TOKENS_JSON?: string;
  CORS_ORIGINS?: string;
}

export interface WorkerVariables {
  user: AuthenticatedUser;
}

export interface WorkerEnv {
  Bindings: WorkerBindings;
  Variables: WorkerVariables;
}
