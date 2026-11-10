#!/usr/bin/env node
/**
 * Sinh danh sách đề cương cần crawl từ `Scraper/catalog-index.csv` + bảng `courses` trong DB.
 *
 * Quy tắc:
 *   1. Chỉ lấy môn có trong bảng `courses` (so mã môn `maso` với `courses.code`, không phân biệt hoa/thường).
 *   2. Với mỗi môn và mỗi học kỳ cần dùng (kỳ hiện tại + kỳ chính kế tiếp, tính theo ngày chạy),
 *      chọn đề cương có học kỳ áp dụng lớn nhất nhưng <= học kỳ đó; trùng học kỳ thì lấy phiên bản lớn nhất.
 *      Nếu môn có đề cương áp dụng SAU học kỳ cuối cần dùng (HK263, hoặc học kỳ nhập sai như HK291)
 *      thì lấy thêm bản mới nhất đó (cột for_semesters ghi "sau 262").
 *   3. Bỏ trùng id (thường kỳ hiện tại và kỳ tới dùng chung một đề cương).
 *   4. Ưu tiên 1: môn thuộc ít nhất một chương trình đào tạo; ưu tiên 2: các môn còn lại trong DB.
 *
 * Kết quả (ghi vào thư mục Scraper):
 *   crawl-list.csv  toàn bộ đề cương cần có, kèm cột `downloaded` (đã có Scraper/data/<id>.json chưa)
 *   crawl-ids.txt   chỉ id CHƯA tải, mỗi dòng một id, theo thứ tự ưu tiên
 *
 * Cách dùng (từ thư mục Backend):
 *   node scripts/build-crawl-list.mjs
 *   node scripts/build-crawl-list.mjs --semesters 261,262   # chỉ định học kỳ thay vì tự tính
 *
 * Chỉ ĐỌC DB (đọc kết nối từ Backend/.env), không ghi gì vào DB.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const backendDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scraperDir = resolve(backendDir, '..', 'Scraper');
process.loadEnvFile(resolve(backendDir, '.env'));

/* ------------------------------- Học kỳ ------------------------------- */

const toCode = (year, term) => `${String(year % 100).padStart(2, '0')}${term}`;
/** Giống Frontend/src/pages/courses/analysis/semester.ts. */
const currentSemester = (today = new Date()) => {
  const month = today.getMonth() + 1;
  const year = today.getFullYear();
  if (month >= 8) return toCode(year, 1);
  if (month <= 5) return toCode(year - 1, 2);
  return toCode(year - 1, 3);
};
const nextMainSemester = code => {
  const year = 2000 + Number(code.slice(0, 2));
  return code[2] === '1' ? toCode(year, 2) : toCode(year + 1, 1);
};

const semesterArg = process.argv.indexOf('--semesters');
const semesters = semesterArg > 0
  ? process.argv[semesterArg + 1].split(',').map(code => code.trim())
  : [currentSemester(), nextMainSemester(currentSemester())];
if (!semesters.every(code => /^\d{2}[123]$/.test(code))) {
  console.error(`Học kỳ không hợp lệ: ${semesters.join(',')} (dạng 261, 262)`);
  process.exit(1);
}

/* ------------------------------- Danh mục ------------------------------- */

/** CSV chuẩn: trường trong ngoặc kép có thể chứa dấu phẩy, "" và xuống dòng. */
const parseCsv = text => {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
};

const catalogFile = resolve(scraperDir, 'catalog-index.csv');
const [header, ...lines] = parseCsv(readFileSync(catalogFile, 'utf8').replace(/^\uFEFF/, ''));
const expected = ['id', 'code', 'maso', 'ten', 'tc', 'hk'];
if (header.join() !== expected.join()) throw new Error(`Cột CSV không đúng: ${header.join()} (cần ${expected.join()})`);

const normalize = code => code.trim().toUpperCase();
let skipped = 0;
const outlines = lines.filter(cells => cells.length === 6).flatMap(([id, code, maso, ten, tc, hk]) => {
  const version = code.split('.').slice(2).map(Number);
  // hk dạng 20261 -> 261; bỏ dòng thiếu/không hợp lệ (ví dụ rỗng, 19913).
  if (!/^\d+$/.test(id) || !/^20\d{2}[123]$/.test(hk) || version.length !== 2 || version.some(Number.isNaN)) {
    skipped += 1;
    return [];
  }
  return [{ id, code, maso: normalize(maso), ten: ten.replace(/\s+/g, ' ').trim(), tc, hk, semester: hk.slice(2), version }];
});

const bySubject = new Map();
outlines.forEach(outline => bySubject.set(outline.maso, [...(bySubject.get(outline.maso) ?? []), outline]));
const byVersion = (a, b) => a.version[0] - b.version[0] || a.version[1] - b.version[1];
/**
 * Bản áp dụng sau mọi học kỳ cần dùng (ví dụ HK263, hoặc HK291 do nhập sai như CH4051 v3.1).
 * Lấy thêm để không bỏ sót đề cương mới nhất, và để môn chỉ có bản "tương lai" (IM3109) vẫn có dữ liệu.
 */
const pickFuture = (maso, after) => (bySubject.get(maso) ?? [])
  .filter(outline => outline.semester > after)
  .sort((a, b) => a.semester.localeCompare(b.semester) || byVersion(a, b))
  .at(-1) ?? null;
const pick = (maso, semester) => {
  const candidates = (bySubject.get(maso) ?? []).filter(outline => outline.semester <= semester);
  if (!candidates.length) return null;
  const top = candidates.reduce((max, outline) => (outline.semester > max ? outline.semester : max), '');
  return candidates.filter(outline => outline.semester === top).sort(byVersion).at(-1);
};

/* ---------------------------------- DB ---------------------------------- */

const schema = process.env.DB_SCHEMA ?? 'public';
if (!/^[a-z_][a-z0-9_]{0,62}$/.test(schema)) throw new Error('DB_SCHEMA không hợp lệ');
const client = new pg.Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL_MODE === 'require' ? { rejectUnauthorized: false } : false,
});
await client.connect();
let courses;
try {
  ({ rows: courses } = await client.query(`
    SELECT c.code,
           COALESCE(string_agg(DISTINCT cu.code, '|' ORDER BY cu.code), '') AS curricula
    FROM "${schema}".courses c
    LEFT JOIN "${schema}".curriculum_courses cc ON cc.course_id = c.id
    LEFT JOIN "${schema}".curricula cu ON cu.id = cc.curriculum_id
    GROUP BY c.code
  `));
} finally {
  await client.end();
}

/* ------------------------------- Chọn id ------------------------------- */

const wanted = new Map();
const noOutline = [];
for (const course of courses) {
  const maso = normalize(course.code);
  const lastSemester = [...semesters].sort().at(-1);
  const picks = [
    ...semesters.map(semester => [semester, pick(maso, semester)]),
    [`sau ${lastSemester}`, pickFuture(maso, lastSemester)],
  ].filter(([, outline]) => outline);
  if (!picks.length) {
    if (course.curricula) noOutline.push(`${maso} (${course.curricula})`);
    continue;
  }
  for (const [semester, outline] of picks) {
    const entry = wanted.get(outline.id) ?? { outline, dbCode: course.code, curricula: course.curricula, for: [] };
    entry.for.push(semester);
    wanted.set(outline.id, entry);
  }
}

const entries = [...wanted.values()]
  .map(entry => ({
    ...entry,
    priority: entry.curricula ? 1 : 2,
    downloaded: existsSync(resolve(scraperDir, 'data', `${entry.outline.id}.json`)),
  }))
  .sort((a, b) => a.priority - b.priority || a.outline.maso.localeCompare(b.outline.maso) || a.outline.semester.localeCompare(b.outline.semester));

const csvCell = value => `"${String(value).replace(/"/g, '""')}"`;
const csv = [
  ['priority', 'id', 'code', 'maso', 'ten', 'tc', 'hk', 'for_semesters', 'curricula', 'downloaded'].join(','),
  ...entries.map(({ outline, priority, curricula, downloaded, ...entry }) => [
    priority, outline.id, outline.code, outline.maso, outline.ten, outline.tc, outline.hk,
    entry.for.join('|'), curricula, downloaded ? 1 : 0,
  ].map(csvCell).join(',')),
].join('\n');
writeFileSync(resolve(scraperDir, 'crawl-list.csv'), `\uFEFF${csv}\n`, 'utf8');

const todo = entries.filter(entry => !entry.downloaded);
writeFileSync(resolve(scraperDir, 'crawl-ids.txt'), `${todo.map(entry => entry.outline.id).join('\n')}\n`, 'utf8');

const count = (list, priority) => list.filter(entry => entry.priority === priority).length;
console.log(`Học kỳ: ${semesters.join(', ')} | danh mục: ${outlines.length} đề cương (${skipped} dòng bỏ vì thiếu/sai học kỳ)`);
console.log(`Môn trong DB: ${courses.length} | có đề cương: ${new Set(entries.map(entry => entry.outline.maso)).size}`);
console.log(`Cần có: ${entries.length} đề cương (ưu tiên 1: ${count(entries, 1)}, ưu tiên 2: ${count(entries, 2)})`);
console.log(`Đã tải: ${entries.length - todo.length} | CẦN CRAWL: ${todo.length} (ưu tiên 1: ${count(todo, 1)}, ưu tiên 2: ${count(todo, 2)})`);
if (noOutline.length) console.log(`Môn trong chương trình không có đề cương: ${noOutline.join(', ')}`);
console.log(`Đã ghi ${resolve(scraperDir, 'crawl-list.csv')} và ${resolve(scraperDir, 'crawl-ids.txt')}`);
