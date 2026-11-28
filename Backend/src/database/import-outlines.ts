import 'dotenv/config';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { DataSource } from 'typeorm';
import { OutlineImportService } from '../outline/outline-import.service';
import type { OutlineDocument } from '../outline/outline-format';
import { getDatabaseOptions } from './database-options';
import { entities } from './entities';

/**
 * Nhập file đề cương `bkuni.course-outlines` bằng dòng lệnh (không cần chạy server), dùng đúng
 * OutlineImportService của API `POST /api/course-outlines/import`:
 *
 *   npm run outlines:import -- ../Scraper/out                    # mọi course-outlines*.json trong thư mục
 *   npm run outlines:import -- ../Scraper/out/course-outlines-001.json
 *
 * Chỉ thêm/cập nhật theo (course_code, version); không xóa gì, không sửa courses/course_relations.
 */
async function main(): Promise<void> {
  const targets = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
  if (!targets.length) throw new Error('Cần đường dẫn tới file hoặc thư mục chứa course-outlines*.json');

  const files = targets.flatMap(target => {
    const path = resolve(process.cwd(), target);
    if (!existsSync(path)) throw new Error(`Không thấy ${path}`);
    if (!statSync(path).isDirectory()) return [path];
    return readdirSync(path)
      .filter(name => /^course-outlines(-\d+)?\.json$/.test(name))
      .sort()
      .map(name => join(path, name));
  });
  if (!files.length) throw new Error('Không có file course-outlines*.json nào');

  const dataSource = new DataSource({
    ...getDatabaseOptions(process.env as Record<string, unknown>),
    entities,
    synchronize: false,
    migrations: [],
  });
  await dataSource.initialize();
  const importer = new OutlineImportService(dataSource);
  const total = { received: 0, created: 0, updated: 0, unchanged: 0, skipped: 0 };

  try {
    for (const file of files) {
      const started = Date.now();
      const document = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) as OutlineDocument;
      const result = await importer.importDocument(document, { channel: 'cli' });
      (Object.keys(total) as (keyof typeof total)[]).forEach(key => { total[key] += result[key]; });
      console.log(
        `${file}: nhận ${result.received}, tạo ${result.created}, cập nhật ${result.updated}, ` +
        `giữ nguyên ${result.unchanged}, bỏ qua ${result.skipped} (${((Date.now() - started) / 1000).toFixed(1)} s)`,
      );
      result.issues.slice(0, 5).forEach(issue => {
        console.log(`  - #${issue.index} ${issue.course_code ?? '?'}@${issue.version ?? '?'}: ${issue.errors.join('; ')}`);
      });
    }
  } finally {
    await dataSource.destroy();
  }
  console.log(
    `Tổng: nhận ${total.received}, tạo ${total.created}, cập nhật ${total.updated}, giữ nguyên ${total.unchanged}, bỏ qua ${total.skipped}`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Lỗi: ${message}`);
  process.exitCode = 1;
});
