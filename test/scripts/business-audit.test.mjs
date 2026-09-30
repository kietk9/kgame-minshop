import { describe, expect, it } from 'vitest';
import { main, parseD1Output } from '../../scripts/audit_business.mjs';

describe('business audit command', () => {
  it('aborts on a failed query without announcing a pass', async () => {
    const messages = [];
    let calls = 0;
    const exit = await main([], { log: v => messages.push(v), error: v => messages.push(v),
      query: async () => { calls++; throw new Error('database unavailable'); } });
    expect(exit).toBe(2);
    expect(calls).toBe(1);
    expect(messages.join(' ')).toContain('KHÔNG HOÀN TẤT');
    expect(messages.join(' ')).not.toContain('"passed": true');
  });
  it('refuses fix and remote flags before touching the database', async () => {
    for (const flag of ['--fix', '--remote']) {
      let calls = 0;
      expect(await main([flag], { error: () => {}, query: async () => { calls++; return []; } })).toBe(2);
      expect(calls).toBe(0);
    }
  });
  it('returns a failing gate when a discrepancy is found', async () => {
    let calls = 0;
    const exit = await main([], { log: () => {}, query: async () => {
      return calls++ === 0 ? [{ id: 1, code: 'ĐH0001', expected: 100, actual: 50 }] : [];
    } });
    expect(exit).toBe(1);
  });
  it('rejects invalid JSON, missing success, and failed D1 results', () => {
    for (const output of ['', '[]', '[{"results": []}]', '[{"success":false,"results":[]}]']) {
      expect(() => parseD1Output(output)).toThrow();
    }
    expect(parseD1Output('[{"success":true,"results":[]}]')).toEqual([]);
  });
});
