#!/usr/bin/env node
/**
 * Seed danh mục môn học và học kỳ đã mở từ trang "Môn học mở lớp" của myBK đã lưu thành HTML.
 *
 * Mỗi file là danh sách môn mở lớp của MỘT học kỳ; mã học kỳ lấy từ tên file (251.html -> 251).
 * Môn được đọc từ bảng #tblMonHocMoLop: cột Mã MH, Tên MH, Số tín chỉ.
 *
 * Ghi thẳng vào PostgreSQL (không cần chạy server), trong một transaction:
 *   1. Môn chưa có (so mã không phân biệt hoa/thường) -> tạo mới với tên/tín chỉ trong file.
 *      Môn đã có -> GIỮ NGUYÊN tên và tín chỉ (tên trong DB thường đầy đủ hơn tên viết tắt của myBK);
 *      môn lệch tín chỉ chỉ được liệt kê trong báo cáo.
 *   2. Thêm (môn, học kỳ) vào course_opened_semesters; cặp đã có thì bỏ qua.
 * Không xóa gì, nên chạy lại nhiều lần vẫn an toàn.
 *
 * Cách dùng (từ thư mục Backend):
 *   node scripts/seed-opened-semesters.mjs ../251.html ../252.html ../253.html ../261.html --dry-run
 *   node scripts/seed-opened-semesters.mjs ../251.html ../252.html ../253.html ../261.html
 *
 * Kết nối DB đọc từ Backend/.env (DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_NAME, DB_SCHEMA, DB_SSL_MODE).
 */
import { readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const backendDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.loadEnvFile(resolve(backendDir, '.env'));

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const files = args.filter(arg => !arg.startsWith('--'));
if (!files.length) {
  console.error('Cần ít nhất một file HTML, ví dụ: node scripts/seed-opened-semesters.mjs ../251.html');
  process.exit(1);
}

const decode = text => text
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const cellText = html => decode(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

/** Đọc một file: trả về mã học kỳ và danh sách môn { code, name, credits }. */
const parseFile = file => {
  const semester = basename(file).match(/^(\d{2}[123])\b/)?.[1];
  if (!semester) throw new Error(`Không lấy được mã học kỳ (YYK) từ tên file: ${file}`);

  const html = readFileSync(file, 'utf8');
  const start = html.indexOf('id="tblMonHocMoLop"');
  if (start < 0) throw new Error(`Không thấy bảng #tblMonHocMoLop trong ${file}`);
  const table = html.slice(start, html.indexOf('</table>', start));

  const courses = [];
  // Các kỳ cũ (20x-24x) xuất HTML khác khoảng trắng/dấu nháy: `<tr  id='monHoc…' >`.
  for (const [, row] of table.matchAll(/<tr\s+id=['"]monHoc\d+['"][^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(match => cellText(match[1]));
    const [, , code, name, creditsText] = cells;
    const credits = Number(creditsText);
    if (!code || !name || !Number.isInteger(credits) || credits < 0) {
      throw new Error(`Dòng không hợp lệ trong ${file}: ${JSON.stringify(cells)}`);
    }
    courses.push({ code, name, credits });
  }
  if (!courses.length) throw new Error(`Không đọc được môn nào trong ${file}`);
  return { file, semester, courses };
};

const sources = files.map(file => parseFile(resolve(file)));

// Gộp theo mã (không phân biệt hoa/thường); cùng một môn ở nhiều kỳ phải cùng số tín chỉ.
const catalog = new Map();
for (const { semester, courses } of sources) {
  for (const course of courses) {
    const key = course.code.toLowerCase();
    const known = catalog.get(key);
    if (known && known.credits !== course.credits) {
      throw new Error(`Môn ${course.code} có số tín chỉ khác nhau giữa các kỳ (${known.credits} và ${course.credits}).`);
    }
    if (known) known.semesters.add(semester);
    else catalog.set(key, { ...course, semesters: new Set([semester]) });
  }
}

const env = process.env;
const sslMode = env.DB_SSL_MODE ?? 'local';
const schema = env.DB_SCHEMA || 'public';
if (!/^[a-z_][a-z0-9_]{0,62}$/.test(schema)) throw new Error('DB_SCHEMA không hợp lệ');
const table = name => `"${schema}"."${name}"`;

const client = new pg.Client({
  host: env.DB_HOST,
  port: Number(env.DB_PORT),
  user: env.DB_USERNAME,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  ssl: sslMode === 'require' ? { rejectUnauthorized: false } : false,
});

const loadCourses = async () => {
  const { rows } = await client.query(`SELECT id, code, name, credits FROM ${table('courses')}`);
  return new Map(rows.map(row => [row.code.toLowerCase(), row]));
};

await client.connect();
try {
  await client.query('BEGIN');

  const before = await loadCourses();
  const missing = [...catalog.entries()].filter(([key]) => !before.has(key)).map(([, course]) => course);
  const creditMismatches = [...catalog.entries()]
    .filter(([key, course]) => before.has(key) && before.get(key).credits !== course.credits)
    .map(([key, course]) => `${before.get(key).code}: DB ${before.get(key).credits} TC, file ${course.credits} TC`);

  if (missing.length) {
    await client.query(
      `INSERT INTO ${table('courses')} ("code", "name", "credits")
       SELECT * FROM unnest($1::varchar[], $2::varchar[], $3::int[])
       ON CONFLICT ((lower("code"))) DO NOTHING`,
      [missing.map(c => c.code), missing.map(c => c.name), missing.map(c => c.credits)],
    );
  }

  const after = await loadCourses();
  const pairs = [...catalog.entries()].flatMap(([key, course]) => (
    [...course.semesters].map(semester => [after.get(key).id, semester])
  ));
  const opened = await client.query(
    `INSERT INTO ${table('course_opened_semesters')} ("course_id", "semester_code")
     SELECT * FROM unnest($1::uuid[], $2::varchar[])
     ON CONFLICT ON CONSTRAINT "UQ_course_opened_semester" DO NOTHING`,
    [pairs.map(pair => pair[0]), pairs.map(pair => pair[1])],
  );

  for (const { file, semester, courses } of sources) {
    console.log(`Học kỳ ${semester}: ${courses.length} môn (${basename(file)})`);
  }
  console.log(`Tổng số mã môn khác nhau trong các file: ${catalog.size}`);
  console.log(`Môn đã có trong DB (giữ nguyên tên/tín chỉ): ${catalog.size - missing.length}`);
  console.log(`Môn tạo mới: ${missing.length}`);
  console.log(`Cặp (môn, học kỳ) thêm mới: ${opened.rowCount} / ${pairs.length}`);
  if (creditMismatches.length) {
    console.log(`Môn lệch tín chỉ giữa DB và file (không ghi đè): ${creditMismatches.length}`);
    creditMismatches.forEach(line => console.log(`  ${line}`));
  }

  if (dryRun) {
    await client.query('ROLLBACK');
    console.log('--dry-run: đã rollback, DB không thay đổi.');
  } else {
    await client.query('COMMIT');
    console.log('Đã lưu.');
  }
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  throw error;
} finally {
  await client.end();
}
