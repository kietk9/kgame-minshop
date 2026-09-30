import { readFileSync, readdirSync } from 'node:fs';

// Split SQLite statements without cutting quoted text or trigger bodies. This
// allows the KGAME tests to use production migrations rather than copied tables.
function statements(source) {
  const result = [];
  let current = '', quote = '', depth = 0, token = '', trigger = false;
  const flushToken = () => {
    if (/^CREATE\s+(?:TEMP(?:ORARY)?\s+)?TRIGGER\b/i.test(current.trim())) trigger = true;
    if (trigger) {
      if (/^(BEGIN|CASE)$/i.test(token)) depth++;
      if (/^END$/i.test(token)) depth--;
    }
    token = '';
  };
  for (let i = 0; i < source.length; i++) {
    const c = source[i], next = source[i + 1];
    if (quote) {
      current += c;
      if (c === quote) {
        if (next === quote) current += source[++i];
        else quote = '';
      }
      continue;
    }
    if (c === '-' && next === '-') {
      flushToken(); while (i < source.length && source[i] !== '\n') i++;
      current += '\n'; continue;
    }
    if (c === '/' && next === '*') {
      flushToken(); i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i++;
      i++; current += ' '; continue;
    }
    if (c === "'" || c === '"' || c === '`' || c === '[') {
      flushToken(); quote = c === '[' ? ']' : c; current += c; continue;
    }
    if (/[a-zA-Z_]/.test(c)) token += c;
    else flushToken();
    current += c;
    if (c === ';' && depth === 0) {
      if (current.trim()) result.push(current.trim());
      current = ''; trigger = false;
    }
  }
  flushToken();
  if (quote || depth) throw new Error('Unterminated migration statement.');
  if (current.trim()) result.push(current.trim());
  return result;
}

export async function applyKgameMigrations(db) {
  const dir = new URL('../../migrations/', import.meta.url);
  for (const file of readdirSync(dir).filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
    for (const sql of statements(readFileSync(new URL(file, dir), 'utf8'))) {
      try { await db.prepare(sql).run(); }
      catch (err) { throw new Error(`Migration ${file}: ${err.message}`); }
    }
  }
}
