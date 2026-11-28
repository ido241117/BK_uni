#!/usr/bin/env node
/**
 * Seed tài khoản sinh viên Khoa học Máy tính khóa 2023 (CS-2023-KHMT) để test trang Gợi ý học phần.
 * Mọi tài khoản dừng quanh năm 2 (33-58 TC) để bộ giải còn nhiều môn phải xếp. Theo lịch, HK 261 là năm 4 của
 * khóa 2023 nên các bạn này đều chậm tiến độ; hạn 12 kỳ chính là HK 282 (còn 5 kỳ chính 262-282 cùng các kỳ hè).
 * Mật khẩu mặc định Student@123.
 *
 * Mỗi tài khoản được ghi giống như vừa "Nhập tiến độ từ myBK" rồi "Hiệu chỉnh":
 * - users, student_profiles (chương trình CS-2023-KHMT, khóa 2023);
 * - student_courses: Đã hoàn thành / Đang học / Chưa đạt; chứng chỉ GDTC -> PE1003, PE1005; ENG_GC_600, SA4001
 *   ghi "Đã hoàn thành" khi đạt (giống importMybk);
 * - student_regulation_statuses theo điều kiện tốt nghiệp đã đạt;
 * - student_progress_imports: JSON giả lập file myBK (khối, điểm, GPA, điều kiện tốt nghiệp) để engine tính GPA và
 *   để trang Gợi ý lưu được cài đặt (PUT /plans/settings báo lỗi nếu chưa có dòng này). Có thể kèm
 *   `data.web.block_choices` (khối sinh viên tự chọn cho môn) và `data.web.planner` (kịch bản what-if dựng sẵn).
 *
 * Kịch bản (--scenario=<tên>, mặc định chạy tất cả):
 *   steady       khmt.nam2@bkuni.local    Xong năm 1 và năm 2 kỳ 1, đang học đúng các môn năm 2 kỳ 2. Mốc chuẩn.
 *   retake       khmt.rot@bkuni.local     Rớt CO2003 (CTDL&GT) và MT1005 chưa học lại, đang học lại CO1027 (chặn
 *                                         CO3005, CO3015, CO3135), GPA thấp.
 *   paused       khmt.baoluu@bkuni.local  Chỉ xong năm 1, bảo lưu HK 261 (không có môn đang học): lộ trình dài, nặng.
 *   early-elect  khmt.tuchon@bkuni.local  Như steady nhưng đã học sớm CO3061 (nhóm C, tự chọn tính vào Tự chọn tự do),
 *                                         IM1013 (nhóm D) và CO3141 (ngoài chương trình).
 *   out-of-order khmt.lech@bkuni.local    Học lệch: đã học trước CO2013, CO3001 (năm 3) nhưng bỏ CO2007, CO2011;
 *                                         rớt MT2013; đang học cải thiện MT1003.
 *   preset       khmt.he@bkuni.local      Như steady, kèm kịch bản dựng sẵn (chưa giải): học hè 263 và 273, ghim CO2013
 *                                         vào 262, CO3001 không mở ở 262, muốn 21 TC ở 262, muốn học CO3117, CO3133,
 *                                         học xong trước 281.
 *
 * Ghi thẳng vào PostgreSQL trong một transaction (không cần chạy server). Mỗi lần chạy XÓA HẲN tài khoản (cascade:
 * hồ sơ, môn, tiến độ, lộ trình đã lưu, lịch sử chat) rồi tạo lại. Chạy tất cả còn xóa các email của bản seed trước
 * (LEGACY_EMAILS). Không đụng khmt.demo, khmt.cham (seed-demo-student.mjs).
 *
 *   node scripts/seed-recommendation-students.mjs --dry-run
 *   node scripts/seed-recommendation-students.mjs
 *   node scripts/seed-recommendation-students.mjs --scenario=retake
 */
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const backendDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.loadEnvFile(resolve(backendDir, '.env'));
const bcrypt = createRequire(import.meta.url)('bcrypt');

const arg = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const dryRun = process.argv.includes('--dry-run');
const PASSWORD = arg('password') ?? 'Student@123';
const CURRICULUM_CODE = 'CS-2023-KHMT';
const FREE_GROUP = 'Tự chọn tự do';
/** Email của bản seed trước (dừng ở năm 3-4), xóa khi chạy tất cả. */
const LEGACY_EMAILS = ['khmt.vuot@bkuni.local', 'khmt.trong@bkuni.local', 'khmt.nghi@bkuni.local'];

const YEAR_1 = [
  'CO1005', 'CO1023', 'LA1003', 'MT1003', 'PE1003', 'PH1003',
  'CO1007', 'CO1027', 'LA1005', 'MI1003', 'MT1005', 'MT1007', 'PE1005', 'PH1007',
]; // 33 TC
const YEAR_2_TERM_1 = ['CO2003', 'CO2007', 'CO2011', 'LA1007', 'SP1031']; // 16 TC
const YEAR_2_TERM_2 = ['CO2017', 'CO2039', 'LA1009', 'MT2013', 'SP1033']; // 14 TC
const without = (list, ...drop) => list.filter(code => !drop.includes(code));

const GDTC = 'Chứng chỉ Giáo dục Thể chất';
const GDQP = 'Chứng chỉ Giáo dục Quốc phòng';
const ENGLISH = 'Đ/kiện tiếng Anh tốt nghiệp ĐH tiêu chuẩn, VLVH';
const ACTIVITIES = 'Hoạt động sinh viên';

/**
 * completed/inProgress/failed: mã môn. improved: môn đang học cải thiện (file myBK ghi đã đạt, có điểm cũ).
 * scoreRange: khoảng điểm hệ 10 sinh ngẫu nhiên (cố định theo email + mã môn) cho môn đã đạt.
 */
const SCENARIOS = {
  steady: {
    email: 'khmt.nam2@bkuni.local', name: 'Huỳnh Thanh Tâm', mssv: '2310994', birth: '2005-12-30',
    address: 'Biên Hòa, Đồng Nai', scoreRange: [6.0, 8.8],
    completed: [...YEAR_1, ...YEAR_2_TERM_1],
    inProgress: YEAR_2_TERM_2,
    failed: [],
    regulations: [GDTC, GDQP],
  },
  retake: {
    email: 'khmt.rot@bkuni.local', name: 'Phạm Quốc Huy', mssv: '2310991', birth: '2005-11-02',
    address: 'Thủ Đức, TP.HCM', scoreRange: [4.5, 7.0],
    completed: [...without(YEAR_1, 'CO1027', 'MT1005'), ...without(YEAR_2_TERM_1, 'CO2003')],
    inProgress: ['CO1027', 'CO2017', 'MT2013', 'SP1033', 'LA1009'], // CO1027 học lại
    failed: ['CO2003', 'MT1005'], // rớt, chưa đăng ký học lại
    regulations: [GDTC, GDQP],
  },
  paused: {
    email: 'khmt.baoluu@bkuni.local', name: 'Đặng Minh Tuấn', mssv: '2310993', birth: '2005-08-14',
    address: 'Gò Vấp, TP.HCM', scoreRange: [5.5, 8.0],
    completed: YEAR_1,
    inProgress: [], // bảo lưu HK 261
    failed: [],
    regulations: [GDTC, GDQP],
  },
  'early-elect': {
    email: 'khmt.tuchon@bkuni.local', name: 'Võ Thị Lan Anh', mssv: '2310992', birth: '2005-05-27',
    address: 'Bình Thạnh, TP.HCM', scoreRange: [7.0, 9.5],
    completed: [...YEAR_1, ...YEAR_2_TERM_1,
      'CO3061', // Nhập môn Trí tuệ Nhân tạo (nhóm C), sinh viên chọn tính vào Tự chọn tự do
      'IM1013', // Kinh tế học Đại cương (nhóm D)
      'CO3141', // ngoài chương trình -> Tự chọn tự do
    ],
    inProgress: YEAR_2_TERM_2,
    failed: [],
    blockChoices: { CO3061: FREE_GROUP },
    regulations: [GDTC, GDQP, ENGLISH],
  },
  'out-of-order': {
    email: 'khmt.lech@bkuni.local', name: 'Lê Hoàng Phúc', mssv: '2310990', birth: '2005-01-09',
    address: 'Quận 10, TP.HCM', scoreRange: [6.0, 9.0],
    completed: [...without(YEAR_1, 'MT1003'), 'CO2003', 'SP1031', 'CO2017', 'CO2013', 'CO3001'],
    inProgress: ['MT1003', 'CO2007', 'CO2039', 'CO3093', 'SP1033'], // MT1003 học cải thiện
    improved: { MT1003: '5.2' },
    failed: ['MT2013'],
    regulations: [GDTC, GDQP],
  },
  preset: {
    email: 'khmt.he@bkuni.local', name: 'Bùi Ngọc Hân', mssv: '2310995', birth: '2005-04-18',
    address: 'Quận 7, TP.HCM', scoreRange: [7.0, 9.5],
    completed: [...YEAR_1, ...YEAR_2_TERM_1],
    inProgress: YEAR_2_TERM_2,
    failed: [],
    regulations: [GDTC, GDQP],
    planner: {
      graduateBy: '281',
      results: {},
      summers: ['263', '273'],
      locked: [{ course_code: 'CO2013', semester_code: '262' }],
      notOffered: [{ course_code: 'CO3001', semester_code: '262' }],
      wanted: ['CO3117', 'CO3133'],
      skipped: [],
      targets: { 262: 21 },
      assumedFail: [],
      offered: [],
      freeChoices: [],
    },
  },
};

const selected = arg('scenario');
if (selected && !SCENARIOS[selected]) {
  console.error(`Không có kịch bản "${selected}". Chọn một trong: ${Object.keys(SCENARIOS).join(', ')}`);
  process.exit(1);
}
if (Buffer.byteLength(PASSWORD, 'utf8') < 8 || Buffer.byteLength(PASSWORD, 'utf8') > 72) {
  console.error('Mật khẩu phải từ 8 đến 72 byte UTF-8.');
  process.exit(1);
}

/** Điểm cố định theo (email, mã môn) để chạy lại ra cùng kết quả. */
const scoreFor = (email, code, [lo, hi]) => {
  const n = createHash('sha256').update(`${email}:${code}`).digest().readUInt32BE(0) / 0xffffffff;
  return (Math.round((lo + n * (hi - lo)) * 10) / 10).toFixed(1);
};
const LETTERS = [[9.5, 'A+', 4], [8.5, 'A', 4], [8, 'B+', 3.5], [7, 'B', 3], [6.5, 'C+', 2.5], [5.5, 'C', 2],
  [5, 'D+', 1.5], [4, 'D', 1], [0, 'F', 0]];
const letterOf = score => LETTERS.find(([min]) => Number(score) >= min);

/** Tên khối trên file myBK theo tên nhóm (category) của chương trình. */
const blockOf = category => {
  if (/^Chuyên ngành - nhóm/.test(category)) return { kind: 'TC', name: 'Chuyên ngành' };
  if (/^Quản lý - nhóm/.test(category)) return { kind: 'TC', name: 'Quản lý' };
  return { kind: 'BB', name: category };
};
const SKIP_CATEGORY = name => name === 'Điều kiện tốt nghiệp' || name.startsWith('Chứng chỉ')
  || (/^Chuyên ngành /.test(name) && !name.startsWith('Chuyên ngành - nhóm'));

const env = process.env;
const client = new pg.Client({
  host: env.DB_HOST,
  port: Number(env.DB_PORT ?? 5432),
  user: env.DB_USERNAME,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  // Giống database-options.ts: chỉ `require` mới dùng TLS; `local` (mặc định) là Postgres trên máy.
  ssl: env.DB_SSL_MODE === 'require' ? { rejectUnauthorized: false } : false,
});

async function seed(name, s, ctx) {
  const { curriculum, courseByCode, categories, groups, credits } = ctx;
  const email = s.email.toLowerCase();
  const improved = s.improved ?? {};
  const statusOf = new Map([
    ...s.completed.map(code => [code, 'completed']),
    ...s.inProgress.map(code => [code, 'in-progress']),
    ...s.failed.map(code => [code, 'failed']),
  ]);
  const dup = [...s.completed, ...s.inProgress, ...s.failed].length - statusOf.size;
  if (dup) throw new Error(`[${name}] có mã môn ghi hai trạng thái`);
  const regs = new Set(s.regulations);
  // Điều kiện tốt nghiệp ghi trạng thái môn như importMybk.
  if (regs.has(ENGLISH)) statusOf.set('ENG_GC_600', 'completed');
  if (regs.has(ACTIVITIES)) statusOf.set('SA4001', 'completed');
  const missing = [...statusOf.keys(), ...Object.keys(s.blockChoices ?? {})].filter(code => !courseByCode.has(code));
  if (missing.length) throw new Error(`[${name}] không thấy môn trong danh mục: ${missing.join(', ')}`);

  // ----- Tài khoản, hồ sơ -----
  const hash = await bcrypt.hash(PASSWORD, 10);
  const removed = await removeStudents([email]);
  const userId = (await client.query(
    `INSERT INTO users (email, password, role) VALUES ($1, $2, 'STUDENT') RETURNING id`, [email, hash],
  )).rows[0].id;
  await client.query(
    `INSERT INTO student_profiles (user_id, full_name, student_number, phone, birth_date, admission_year, address, curriculum_id, credit_target)
     VALUES ($1, $2, $3, $4, $5, 2023, $6, $7, 18)`,
    [userId, s.name, s.mssv, `0900${s.mssv.slice(-6)}`, s.birth, s.address, curriculum.id],
  );

  // ----- Trạng thái môn, quy định -----
  const rows = [...statusOf];
  await client.query(
    `INSERT INTO student_courses (user_id, course_id, status)
     SELECT $1, course_id, status::student_course_status_enum FROM unnest($2::uuid[], $3::text[]) AS t(course_id, status)`,
    [userId, rows.map(([code]) => courseByCode.get(code).id), rows.map(([, status]) => status)],
  );
  const regRows = await client.query(
    `INSERT INTO student_regulation_statuses (user_id, regulation_id, status)
     SELECT $1, id, 'completed' FROM curriculum_regulations WHERE curriculum_id = $2 AND name = ANY($3::text[]) RETURNING id`,
    [userId, curriculum.id, [...regs]],
  );
  if (regRows.rowCount !== regs.size) throw new Error(`[${name}] chỉ khớp ${regRows.rowCount}/${regs.size} quy định`);

  // ----- File myBK giả lập -----
  const courseRow = code => {
    const c = courseByCode.get(code);
    const status = statusOf.get(code);
    let score = null;
    if (status === 'completed') score = scoreFor(email, code, s.scoreRange);
    else if (status === 'failed') score = scoreFor(email, code, [2.0, 3.9]);
    else if (improved[code]) score = improved[code];
    const passed = status === 'completed' || Boolean(improved[code]);
    return { code, name: c.name.split(' / ')[0], note: null, score, letter: score ? letterOf(score)[1] : null,
      passed, credits: c.credits, free_elective: false };
  };
  const inCurriculum = new Set(ctx.curriculumCodes);
  const blocks = [];
  for (const cat of categories.filter(c => !SKIP_CATEGORY(c.name))) {
    const { kind, name: blockName } = blockOf(cat.name);
    const courses = cat.codes.map(courseRow);
    const group = groups.find(g => g.name.startsWith(cat.name.replace(/^(Chuyên ngành - nhóm \w).*/, '$1')));
    const required = kind === 'TC' ? Number(group?.required_credits ?? 0) : courses.reduce((t, c) => t + c.credits, 0);
    const earned = courses.filter(c => c.passed).reduce((t, c) => t + c.credits, 0);
    blocks.push({ kind, name: blockName, courses, earned_credits: Math.min(earned, required), required_credits: required });
  }
  const gdtc = regs.has(GDTC);
  const gdqp = regs.has(GDQP);
  blocks.push({ kind: 'BB', name: GDTC, earned_credits: 0, required_credits: 0, courses: [{ code: 'CCGDTC',
    name: 'Chứng chỉ Giáo Dục Thể Chất', note: null, score: gdtc ? '21' : null, letter: null, passed: gdtc, credits: 0, free_elective: false }] });
  blocks.push({ kind: 'BB', name: GDQP, earned_credits: 0, required_credits: 0, courses: [{ ...courseRow('MI1003'),
    score: gdqp ? '21' : null, letter: null, passed: gdqp }] });
  const free = [...statusOf.keys()].filter(code => !inCurriculum.has(code)).map(courseRow);
  const freeEarned = free.filter(c => c.passed).reduce((t, c) => t + c.credits, 0);
  blocks.push({ kind: 'TC', name: 'Tự chọn bổ sung / tự do', courses: free, earned_credits: Math.min(freeEarned, 9), required_credits: 9 });

  const graded = blocks.flatMap(b => b.courses).filter(c => c.letter && c.credits > 0 && !c.code.startsWith('LA'));
  const gpaCredits = graded.reduce((t, c) => t + c.credits, 0);
  const gpa10 = graded.reduce((t, c) => t + Number(c.score) * c.credits, 0) / gpaCredits;
  const gpa4 = graded.reduce((t, c) => t + letterOf(c.score)[2] * c.credits, 0) / gpaCredits;
  const earnedTotal = [...statusOf].filter(([code, st]) => st === 'completed' || improved[code])
    .reduce((t, [code]) => t + credits(code), 0);
  const data = {
    format: 'pdf', status: 'OK',
    student: { gpa_4: `${gpa4.toFixed(2)}/4.0`, gpa_10: `${gpa10.toFixed(2)}/10`, faculty: 'Khoa Khoa học và Kỹ thuật Máy tính',
      full_name: s.name.toUpperCase(), class_code: 'MT23KHM9', student_number: s.mssv, applied_from_year: '2023' },
    checks: [], updated_at: '2026-11-20', cohort_hint: 2023, total_earned: earnedTotal, specialization: 'Khoa học Máy tính',
    total_required: 128, passed_inferred: true, exported_semester: '261', lists_only_passed: false,
    official_program_code: curriculum.source_code,
    graduation_conditions: [
      { code: 'ENG_GC_600', name: ENGLISH, note: null, score: null, letter: null, passed: regs.has(ENGLISH) },
      { code: 'SA4001', name: ACTIVITIES, note: null, score: null, letter: null, passed: regs.has(ACTIVITIES) },
    ],
    blocks,
  };
  const web = {};
  if (s.blockChoices) {
    web.block_choices = Object.fromEntries(Object.entries(s.blockChoices).map(([code, groupName]) => {
      const group = groups.find(g => g.name === groupName);
      if (!group) throw new Error(`[${name}] không thấy khối ${groupName}`);
      return [code, group.id];
    }));
  }
  if (s.planner) web.planner = { scenario: s.planner, view: null, dirty: 1, plans: [] };
  if (Object.keys(web).length) data.web = web;
  await client.query(
    `INSERT INTO student_progress_imports (user_id, format, official_program_code, source_updated_at, data)
     VALUES ($1, 'pdf', $2, '2026-11-20', $3)`,
    [userId, curriculum.source_code, JSON.stringify(data)],
  );

  const inProgressCredits = s.inProgress.reduce((t, code) => t + credits(code), 0);
  console.log(`${removed ? 'Xóa và tạo lại' : 'Tạo'} ${email} [${name}] - ${s.name}, MSSV ${s.mssv}`);
  console.log(`  Đã đạt ${earnedTotal}/128 TC, đang học ${s.inProgress.length} môn (${inProgressCredits} TC), `
    + `chưa đạt ${s.failed.length} môn, GPA ${gpa4.toFixed(2)}/4, quy định đạt ${regRows.rowCount}/4`
    + `${s.planner ? ', có kịch bản dựng sẵn' : ''}${s.blockChoices ? ', có chọn khối' : ''}`);
}

/** Xóa tài khoản Student theo email (cascade mọi dữ liệu của tài khoản). Email thuộc vai trò khác thì báo lỗi. */
async function removeStudents(emails) {
  const others = (await client.query('SELECT email, role FROM users WHERE LOWER(email) = ANY($1) AND role <> $2', [emails, 'STUDENT'])).rows;
  if (others.length) throw new Error(`${others[0].email} đã tồn tại với vai trò ${others[0].role}`);
  return (await client.query(`DELETE FROM users WHERE LOWER(email) = ANY($1) AND role = 'STUDENT' RETURNING email`, [emails])).rowCount;
}

await client.connect();
try {
  await client.query(`SET search_path TO "${(env.DB_SCHEMA || 'public').replace(/"/g, '""')}"`);
  await client.query('BEGIN');
  const curriculum = (await client.query('SELECT id, source_code FROM curricula WHERE code = $1', [CURRICULUM_CODE])).rows[0];
  if (!curriculum) throw new Error(`Không thấy chương trình ${CURRICULUM_CODE}`);
  const allCodes = [...new Set(Object.values(SCENARIOS).flatMap(s => [...s.completed, ...s.inProgress, ...s.failed]))];
  const courseRows = (await client.query(
    `SELECT id, code, name, credits FROM courses
     WHERE code = ANY($1) OR id IN (SELECT course_id FROM curriculum_courses WHERE curriculum_id = $2)`,
    [allCodes, curriculum.id],
  )).rows;
  const courseByCode = new Map(courseRows.map(row => [row.code, row]));
  const curriculumCodes = (await client.query(
    'SELECT co.code FROM curriculum_courses cc JOIN courses co ON co.id = cc.course_id WHERE cc.curriculum_id = $1', [curriculum.id],
  )).rows.map(r => r.code);
  const categories = (await client.query(
    `SELECT cat.name, array_agg(co.code ORDER BY co.code) AS codes FROM course_categories cat
     JOIN course_category_members m ON m.category_id = cat.id JOIN courses co ON co.id = m.course_id
     WHERE cat.curriculum_id = $1 GROUP BY cat.name ORDER BY cat.name`, [curriculum.id],
  )).rows;
  const groups = (await client.query('SELECT id, name, required_credits FROM course_groups WHERE curriculum_id = $1', [curriculum.id])).rows;
  const credits = code => Number(courseByCode.get(code)?.credits ?? 0);
  const ctx = { curriculum, courseByCode, curriculumCodes, categories, groups, credits };

  if (!selected) {
    // Xóa hết trước khi tạo để MSSV của tài khoản cũ không trùng tài khoản mới.
    const removed = await removeStudents([...LEGACY_EMAILS, ...Object.values(SCENARIOS).map(s => s.email)]);
    console.log(`Xóa ${removed} tài khoản cũ (gồm ${LEGACY_EMAILS.join(', ')} của bản seed trước nếu còn)`);
  }
  for (const [name, scenario] of Object.entries(SCENARIOS)) {
    if (!selected || selected === name) await seed(name, scenario, ctx);
  }
  await client.query(dryRun ? 'ROLLBACK' : 'COMMIT');
  console.log(`${dryRun ? '[dry-run, đã rollback] ' : ''}Xong. Mật khẩu: ${arg('password') ? '(giá trị --password)' : PASSWORD}`);
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('SEED THẤT BẠI:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await client.end();
}
