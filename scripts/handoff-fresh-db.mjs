import { applyKgameMigrations } from '../test/integration/kgame-migrations.mjs';
const origin = new URL(process.argv[2] || 'http://127.0.0.1:4321');
if (origin.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(origin.hostname) || origin.username || origin.password || origin.pathname !== '/') throw new Error('Only a loopback local server is allowed.');
const endpoint = new URL('/cdn-cgi/explorer/api/d1/database/DB/raw', origin);
async function raw(sql, params = []) {
  const response = await fetch(endpoint, { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sql, params }), signal: AbortSignal.timeout(30000) });
  const data = await response.json();
  if (!response.ok || data.success === false || data.errors?.length || !data.result?.[0] || data.result[0].success === false) throw new Error('Local database request failed; inspect the local server.');
  return data.result[0].results;
}
const existing = await raw("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%'");
if (existing.rows.length) throw new Error('Database is not empty. This bootstrap only accepts a fresh test database; it never resets existing data.');
await applyKgameMigrations({ prepare(sql) { return { run: () => raw(sql) }; } });
await raw("INSERT INTO products(name,slug,description,price_cents,currency,stock,stock_new,stock_used,public_id) VALUES('TEST Linux sample','test-linux-sample','Synthetic fixture; not real stock',10000,'vnd',5,5,0,'prod_0123456789')");
console.log('Applied all migrations and one synthetic product. No customer, password, session or payment was imported.');
