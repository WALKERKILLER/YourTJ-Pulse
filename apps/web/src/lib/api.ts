import type { ApiErrorBody, ApiResponse, AuthenticatedUser, GeoJsonFeature } from '@yourtj/contracts';

export interface SubmissionSummary {
  id: string;
  submittedAt: string;
  user: string;
  count: number;
  status: 'pending' | 'applied' | 'rejected';
  message?: string;
  reviewerId?: string;
  reviewedAt?: string;
  reviewMessage?: string;
}

export interface SubmissionDetail extends SubmissionSummary {
  features: GeoJsonFeature[];
  reviewedFeatures?: GeoJsonFeature[];
}

export class ApiClientError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export async function apiRequest<T>(path: string, token?: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (token) headers.set('authorization', `Bearer ${token}`);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(path, { ...init, headers });
  const payload = await response.json() as ApiResponse<T> & { error?: ApiErrorBody };
  if (!response.ok) {
    throw new ApiClientError(response.status, payload.error?.code ?? 'REQUEST_FAILED', payload.error?.message ?? '请求失败');
  }
  return (payload.data ?? payload) as T;
}

export function fetchSession(token: string): Promise<AuthenticatedUser> {
  return apiRequest('/api/me', token);
}
