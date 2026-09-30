import { writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
// Exclusive creation prevents replacing keys that protect an existing database.
writeFileSync('.dev.vars', `SECRETS_KEK=${randomBytes(32).toString('base64')}\nAUTH_SECRET=${randomBytes(48).toString('base64')}\n`, { flag: 'wx', mode: 0o600 });
console.log('Created local keys in .dev.vars; values are not printed.');
