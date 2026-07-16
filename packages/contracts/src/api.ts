export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiResponse<T> {
  data?: T;
  error?: ApiErrorBody;
}
