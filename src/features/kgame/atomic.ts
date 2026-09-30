import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';

/** All assertions and writes execute in the same D1 transaction. A false SQL
 * assertion deliberately raises a SQLite error, rolling back the whole batch. */
export class AtomicBatch {
  readonly checks: D1PreparedStatement[] = [];
  readonly writes: D1PreparedStatement[] = [];
  readonly db: D1Database;
  constructor(db: D1Database) { this.db = db; }

  async assert(predicate: string, values: unknown[], message: string) {
    const row = await this.db.prepare(`SELECT CASE WHEN (${predicate}) THEN 1 ELSE 0 END AS valid`)
      .bind(...values).first<{ valid: number }>();
    if (row?.valid !== 1) throw new Error(message);
    this.checks.push(this.db.prepare(`SELECT CASE WHEN (${predicate}) THEN 1 ELSE json('kgame_atomic_guard_failed') END`)
      .bind(...values));
  }

  add(sql: string, ...values: unknown[]) {
    this.writes.push(this.db.prepare(sql).bind(...values));
  }

  async commit() {
    try {
      const results = await this.db.batch([...this.checks, ...this.writes]);
      if (results.some(result => !result.success)) throw new Error('Ghi dữ liệu thất bại.');
    } catch (err) {
      if (err instanceof Error && /malformed JSON|kgame_atomic_guard_failed/i.test(err.message)) {
        throw new Error('Dữ liệu đơn hàng hoặc tồn kho vừa thay đổi. Vui lòng kiểm tra và thử lại.', { cause: err });
      }
      throw err;
    }
  }
}

export function integer(value: unknown, label: string, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${label} phải là số nguyên ${minimum ? 'dương' : 'không âm'}.`);
  }
  return value;
}

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Dữ liệu giao dịch không hợp lệ.');
  return value as Record<string, unknown>;
}

export function text(value: unknown, fallback = ''): string {
  if (value == null) return fallback;
  if (typeof value !== 'string') throw new Error('Thông tin dạng chữ không hợp lệ.');
  return value.trim();
}

export function requestKey(value: unknown): string {
  if (value == null) return crypto.randomUUID();
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(value)) throw new Error('Mã giao dịch không hợp lệ.');
  return value;
}

export async function fingerprint(value: unknown) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  return [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, '0')).join('');
}

export async function replay<T>(db: D1Database, key: string, hash: string): Promise<T | null> {
  const receipt = await db.prepare('SELECT payload_hash, result_json FROM kgame_operations WHERE operation_key = ?')
    .bind(key).first<{ payload_hash: string; result_json: string }>();
  if (!receipt) return null;
  if (receipt.payload_hash !== hash) throw new Error('Mã giao dịch đã được dùng với nội dung khác.');
  return JSON.parse(receipt.result_json) as T;
}

export async function commitOperation<T>(batch: AtomicBatch, key: string, hash: string): Promise<T> {
  try { await batch.commit(); }
  catch (err) {
    const existing = await replay<T>(batch.db, key, hash);
    if (existing) return existing;
    throw err;
  }
  const result = await replay<T>(batch.db, key, hash);
  if (!result) throw new Error('Không tìm thấy kết quả giao dịch đã ghi.');
  return result;
}

/** A competing retry may finish while validation is reading. Recover its
 * receipt on validation errors too, not only on a failed batch commit. */
export async function executeOperation<T>(db: D1Database, key: string, hash: string, work: () => Promise<T>): Promise<T> {
  const existing = await replay<T>(db, key, hash);
  if (existing) return existing;
  try { return await work(); }
  catch (err) {
    const completed = await replay<T>(db, key, hash);
    if (completed) return completed;
    throw err;
  }
}
