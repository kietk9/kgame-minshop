#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { runBusinessAudit } from '../src/features/kgame/audit.ts';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const wranglerCli = resolve(projectRoot, 'node_modules/wrangler/bin/wrangler.js');

export function parseD1Output(output) {
  const parsed = JSON.parse(output);
  if (!Array.isArray(parsed) || parsed.length !== 1 || parsed[0]?.success !== true
    || !Array.isArray(parsed[0].results)) {
    throw new Error('D1 không trả về kết quả kiểm tra hợp lệ.');
  }
  return parsed[0].results;
}

export async function main(args = process.argv.slice(2), options = {}) {
  const log = options.log ?? console.log;
  const error = options.error ?? console.error;
  if (args.length) {
    error('Audit chỉ đọc dữ liệu cục bộ. Không hỗ trợ --fix hoặc các tham số khác.');
    return 2;
  }
  const query = options.query ?? (async sql => {
    // Separate arguments avoid shell interpolation. Use the installed local CLI
    // directly so this command never downloads a dependency through npx.
    const output = execFileSync(process.execPath,
      [wranglerCli, 'd1', 'execute', 'DB', '--local', '--json', '--command', sql],
      { cwd: projectRoot, encoding: 'utf8', timeout: 30_000,
        env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
        stdio: ['ignore', 'pipe', 'pipe'] });
    return parseD1Output(output);
  });
  try {
    const result = await runBusinessAudit(query);
    log(JSON.stringify(result, null, 2));
    log('Phạm vi: toán học trên chứng từ, các lần thanh toán, tham chiếu quỹ và tồn đã ghi nhận.');
    log('Chưa chứng nhận chính sách công nợ, hoàn tiền, tồn đầu kỳ hoặc đối soát vận chuyển.');
    return result.passed ? 0 : 1;
  } catch (err) {
    error(`KHÔNG HOÀN TẤT KIỂM TRA: ${err instanceof Error ? err.message : String(err)}`);
    return 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
