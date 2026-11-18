import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';

/**
 * Gọi bộ giải Python qua dòng lệnh: `python -m planner.cli --solver ...`, JSON qua stdin/stdout.
 *
 * Biến môi trường (đều không bắt buộc):
 * - PLANNER_DIR: thư mục `pipeline` (mặc định `../pipeline` tính từ thư mục chạy backend).
 * - PLANNER_PYTHON: đường dẫn python (mặc định `.venv` trong PLANNER_DIR).
 * - PLANNER_TIMEOUT_MS: giới hạn thời gian (mặc định 60000).
 * - PLANNER_DUMP_DIR: nếu đặt, ghi JSON đầu vào ra thư mục này để kiểm tra tay (chỉ dùng khi phát triển).
 */
@Injectable()
export class PlannerRunner {
  private readonly logger = new Logger(PlannerRunner.name);

  get dir(): string {
    return resolve(process.env.PLANNER_DIR ?? join(process.cwd(), '..', 'pipeline'));
  }

  get python(): string {
    if (process.env.PLANNER_PYTHON) return process.env.PLANNER_PYTHON;
    const win = join(this.dir, '.venv', 'Scripts', 'python.exe');
    return existsSync(win) ? win : join(this.dir, '.venv', 'bin', 'python');
  }

  async run(input: unknown, solver: 'cpsat' | 'clingo'): Promise<Record<string, unknown>> {
    const payload = JSON.stringify(input);
    this.dump(payload);
    const timeout = Number(process.env.PLANNER_TIMEOUT_MS ?? 60000);
    const time = solver === 'clingo' ? '30' : '20';
    return new Promise((resolvePromise, reject) => {
      const child = spawn(this.python, ['-m', 'planner.cli', '--solver', solver, '--time-limit', time], {
        cwd: this.dir, env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, windowsHide: true,
      });
      const out: Buffer[] = [];
      const err: Buffer[] = [];
      const timer = setTimeout(() => child.kill(), timeout);
      child.stdout.on('data', (chunk: Buffer) => out.push(chunk));
      child.stderr.on('data', (chunk: Buffer) => err.push(chunk));
      child.on('error', (error) => {
        clearTimeout(timer);
        reject(new Error(`Không chạy được bộ giải (${this.python}): ${error.message}`));
      });
      child.on('close', (code, signal) => {
        clearTimeout(timer);
        const text = Buffer.concat(out).toString('utf8');
        if (signal) return resolvePromise({ status: 'TIMEOUT', solver, semesters: [], graduation_semester: null });
        try {
          resolvePromise(JSON.parse(text));
        } catch {
          this.logger.error(`planner.cli thoát mã ${code}: ${Buffer.concat(err).toString('utf8').slice(0, 2000)}`);
          reject(new Error('Bộ giải trả kết quả không đọc được'));
        }
      });
      child.stdin.end(payload, 'utf8');
    });
  }

  private dump(payload: string): void {
    const dir = process.env.PLANNER_DUMP_DIR;
    if (!dir) return;
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `planner-input-${Date.now()}.json`), payload, 'utf8');
  }
}
