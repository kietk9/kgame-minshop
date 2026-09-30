import { describe, expect, it } from 'vitest';
import { parseAdminApiResponse } from './apiResponse';

describe('admin API response validation', () => {
  it('rejects responses that cannot indicate whether saving succeeded', () => {
    for (const value of [null, [], {}, { success: 'true' }]) {
      expect(() => parseAdminApiResponse(value)).toThrow();
    }
  });
  it('keeps server errors and validates optional object data', () => {
    expect(parseAdminApiResponse({ success: false, error: 'Không đủ tồn' })).toEqual({ success: false, error: 'Không đủ tồn' });
    expect(parseAdminApiResponse({ success: true, data: [1] })).toEqual({ success: true });
    expect(parseAdminApiResponse({ success: true, data: { id: 4 } }).data?.id).toBe(4);
  });
});
