export interface AdminApiResponse {
  success: boolean;
  error?: string;
  data?: Record<string, unknown>;
}

export function parseAdminApiResponse(value: unknown): AdminApiResponse {
  if (!value || typeof value !== 'object' || !('success' in value) || typeof value.success !== 'boolean') {
    throw new Error('Phản hồi máy chủ không hợp lệ. Vui lòng thử lại.');
  }
  const result: AdminApiResponse = { success: value.success };
  if ('error' in value && typeof value.error === 'string') result.error = value.error;
  if ('data' in value && value.data && typeof value.data === 'object' && !Array.isArray(value.data)) {
    result.data = value.data as Record<string, unknown>;
  }
  return result;
}
