#!/usr/bin/env node
/**
 * Seed tài khoản sinh viên Khoa học Máy tính (CS-2023-KHMT) để demo trợ lý tư vấn. Có 2 kịch bản,
 * cả hai đều khóa 2023, đang học HK 261 (năm 4 kỳ 1 = HK7), kỳ tới là 262 (HK8).
 *
 * --scenario=on-track (mặc định) -> khmt.demo@bkuni.local: đúng tiến độ.
 * - Xong toàn bộ môn bắt buộc năm 1-3 (gồm Thực tập ngoài trường CO3335), nhóm A, nhóm B, tự chọn tự do.
 * - HK 261 đang học: CO4029 (Đồ án chuyên ngành), SP1037, IM3001 (nhóm D), CO3117 (Học máy, nhóm C).
 * - Nhóm C: 3/5 môn (CO3049 Web, CO3043 Di động đã xong + CO3117 Học máy đang học). Cả 3 môn cùng
 *   nằm trong chuyên ngành TTNT và XLA -> còn 2 "combo"; học thêm môn ngoài 2 danh sách này
 *   (ví dụ CO3069 Mật mã) sẽ mất cả hai, tốt nghiệp ngành Khoa học Máy tính không ghi chuyên ngành.
 * - Kỳ tới còn lại: CO4337 (Đồ án tốt nghiệp), SP1007 và 2 môn nhóm C.
 * - Đạt mọi quy định tốt nghiệp.
 *
 * --scenario=behind -> khmt.cham@bkuni.local: chậm khoảng 1 năm, xong 69/128 tín chỉ (~54%).
 * - Xong toàn bộ năm 1-2. HK 261 mới học các môn năm 3 kỳ 1 (CH1003, CO2013, CO3001, CO3093, SP1035)
 *   cùng CO3117 (18 tín chỉ).
 * - 4 môn bắt buộc quá kỳ khuyến nghị (năm 3 kỳ 2 = HK 252): CO2001, CO3005 (đã học, chưa đạt),
 *   CO3335 (chặn CO4029 song hành và CO4337 tiên quyết), SP1039.
 * - SP1037 và SP1039 đều chưa học; đề cương hai môn khuyến nghị lẫn nhau (vòng), chương trình chỉ ghi
 *   SP1037 khuyến nghị SP1039 (không chặn đăng ký).
 * - Nhóm A, B, D, tự chọn tự do chưa học. Nhóm C: 3/5 môn (CO3049 Web, CO3045 Game đã xong + CO3117
 *   Học máy đang học) -> cũng chỉ còn 2 combo TTNT và XLA.
 * - Mới đạt chứng chỉ GDTC, GDQP; chưa đạt chuẩn tiếng Anh và hoạt động sinh viên.
 *
 * Cả hai: chưa đặt chuyên ngành mục tiêu, chưa có kế hoạch học kỳ.
 *
 * Ghi thẳng vào PostgreSQL (không cần chạy server), trong một transaction. Chạy lại được nhiều lần:
 * tài khoản trùng email thì đặt lại mật khẩu, hồ sơ cập nhật, trạng thái môn/quy định/kế hoạch xóa và ghi lại.
 * Lịch sử chat (advisor_sessions) không bị xóa.
 *
 * Cách dùng (từ thư mục Backend):
 *   node scripts/seed-demo-student.mjs --dry-run
 *   node scripts/seed-demo-student.mjs
 *   node scripts/seed-demo-student.mjs --scenario=behind
 *   node scripts/seed-demo-student.mjs --email=khac@bkuni.local --password=MatKhau123
 *
 * Kết nối DB đọc từ Backend/.env (DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_NAME, DB_SCHEMA, DB_SSL_MODE).
 */
import { createRequire } from 'node:module';
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

const YEAR_1 = [
  'CO1005', 'CO1023', 'LA1003', 'MT1003', 'PE1003', 'PH1003',
  'CO1007', 'CO1027', 'LA1005', 'MI1003', 'MT1005', 'MT1007', 'PE1005', 'PH1007',
];
const YEAR_2 = [
  'CO2003', 'CO2007', 'CO2011', 'LA1007', 'SP1031',
  'CO2017', 'CO2039', 'LA1009', 'MT2013', 'SP1033',
];

const SCENARIOS = {
  'on-track': {
    email: 'khmt.demo@bkuni.local',
    profile: {
      full_name: 'Nguyễn Minh Khoa',
      student_number: '2310999',
      phone: '0900000000',
      birth_date: '2005-03-15',
      admission_year: 2023,
      address: 'KTX Khu A, ĐHQG TP.HCM',
      credit_target: 18,
    },
    completed: [
      ...YEAR_1,
      ...YEAR_2,
      // Năm 3
      'CH1003', 'CO2013', 'CO3001', 'CO3093', 'SP1035',
      'CO2001', 'CO3005', 'CO3335', 'SP1039',
      // Nhóm A (HK5), nhóm B (HK6)
      'CO3101', 'CO3107',
      // Nhóm C: Lập trình Web, Phát triển ứng dụng di động (đều thuộc TTNT, XLA)
      'CO3049', 'CO3043',
      // Tự chọn tự do (môn ngoài chương trình, 3 tín chỉ)
      'CO3141', 'CO3053', 'CO3007',
    ],
    inProgress: [
      'CO4029', // Đồ án chuyên ngành
      'SP1037', // Tư tưởng Hồ Chí Minh
      'IM3001', // Nhóm D
      'CO3117', // Học máy (nhóm C, thuộc TTNT, XLA)
    ],
    failed: [],
    regulations: 'all',
  },
  behind: {
    email: 'khmt.cham@bkuni.local',
    profile: {
      full_name: 'Trần Gia Bảo',
      student_number: '2310998',
      phone: '0900000001',
      birth_date: '2005-07-20',
      admission_year: 2023,
      address: 'KTX Khu B, ĐHQG TP.HCM',
      credit_target: 18,
    },
    completed: [
      ...YEAR_1,
      ...YEAR_2,
      // Nhóm C: Lập trình Web (MMANM, TTNT, XLA), Lập trình Game (TTNT, XLA)
      'CO3049', 'CO3045',
    ],
    inProgress: [
      // Năm 3 kỳ 1 (khuyến nghị HK 251), học chậm 1 năm
      'CH1003', 'CO2013', 'CO3001', 'CO3093', 'SP1035',
      'CO3117', // Học máy (nhóm C, thuộc TTNT, XLA)
    ],
    // Năm 3 kỳ 2 (HK 252) còn CO2001, CO3335, SP1039 chưa học -> cùng CO3005 thành 4 môn quá hạn.
    failed: ['CO3005'],
    regulations: ['Chứng chỉ Giáo dục Thể chất', 'Chứng chỉ Giáo dục Quốc phòng'],
  },
};

const SCENARIO_NAME = arg('scenario') ?? 'on-track';
const SCENARIO = SCENARIOS[SCENARIO_NAME];
if (!SCENARIO) {
  console.error(`Không có kịch bản "${SCENARIO_NAME}". Chọn một trong: ${Object.keys(SCENARIOS).join(', ')}`);
  process.exit(1);
}
const EMAIL = (arg('email') ?? SCENARIO.email).trim().toLowerCase();
const PROFILE = SCENARIO.profile;
const COMPLETED = SCENARIO.completed;
const IN_PROGRESS = SCENARIO.inProgress;
const FAILED = SCENARIO.failed;

if (Buffer.byteLength(PASSWORD, 'utf8') < 8 || Buffer.byteLength(PASSWORD, 'utf8') > 72) {
  console.error('Mật khẩu phải từ 8 đến 72 byte UTF-8.');
  process.exit(1);
}

const env = process.env;
const sslMode = (env.DB_SSL_MODE ?? '').toLowerCase();
const client = new pg.Client({
  host: env.DB_HOST,
  port: Number(env.DB_PORT ?? 5432),
  user: env.DB_USERNAME,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  ssl: sslMode === 'require' ? { rejectUnauthorized: false } : false,
});

await client.connect();
try {
  const schema = env.DB_SCHEMA || 'public';
  await client.query(`SET search_path TO "${schema.replace(/"/g, '""')}"`);
  await client.query('BEGIN');

  const curriculum = (await client.query('SELECT id FROM curricula WHERE code = $1', [CURRICULUM_CODE])).rows[0];
  if (!curriculum) throw new Error(`Không thấy chương trình ${CURRICULUM_CODE}`);

  const codes = [...COMPLETED, ...IN_PROGRESS, ...FAILED];
  const courseRows = (await client.query('SELECT id, code FROM courses WHERE UPPER(code) = ANY($1)', [codes])).rows;
  const idByCode = new Map(courseRows.map(row => [row.code.toUpperCase(), row.id]));
  const missing = codes.filter(code => !idByCode.has(code));
  if (missing.length) throw new Error(`Không thấy môn trong danh mục: ${missing.join(', ')}`);

  const hash = await bcrypt.hash(PASSWORD, 10);
  const existing = (await client.query('SELECT id, role FROM users WHERE LOWER(email) = $1', [EMAIL])).rows[0];
  if (existing && existing.role !== 'STUDENT') throw new Error(`${EMAIL} đã tồn tại với vai trò ${existing.role}`);
  const userId = existing
    ? (await client.query('UPDATE users SET password = $2, updated_at = now() WHERE id = $1 RETURNING id', [existing.id, hash])).rows[0].id
    : (await client.query(`INSERT INTO users (email, password, role) VALUES ($1, $2, 'STUDENT') RETURNING id`, [EMAIL, hash])).rows[0].id;

  const profileValues = [
    userId, PROFILE.full_name, PROFILE.student_number, PROFILE.phone, PROFILE.birth_date,
    PROFILE.admission_year, PROFILE.address, curriculum.id, PROFILE.credit_target,
  ];
  const profile = (await client.query('SELECT id FROM student_profiles WHERE user_id = $1', [userId])).rows[0];
  if (profile) {
    await client.query(
      `UPDATE student_profiles SET full_name = $2, student_number = $3, phone = $4, birth_date = $5, admission_year = $6,
         address = $7, curriculum_id = $8, credit_target = $9, target_specialization_id = NULL, updated_at = now()
       WHERE user_id = $1`,
      profileValues,
    );
  } else {
    await client.query(
      `INSERT INTO student_profiles (user_id, full_name, student_number, phone, birth_date, admission_year, address, curriculum_id, credit_target)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      profileValues,
    );
  }

  await client.query('DELETE FROM student_courses WHERE user_id = $1', [userId]);
  await client.query('DELETE FROM student_plan_courses WHERE user_id = $1', [userId]);
  await client.query('DELETE FROM student_regulation_statuses WHERE user_id = $1', [userId]);

  const statusRows = [
    ...COMPLETED.map(code => [idByCode.get(code), 'completed']),
    ...IN_PROGRESS.map(code => [idByCode.get(code), 'in-progress']),
    ...FAILED.map(code => [idByCode.get(code), 'failed']),
  ];
  await client.query(
    `INSERT INTO student_courses (user_id, course_id, status)
     SELECT $1, course_id, status::student_course_status_enum FROM unnest($2::uuid[], $3::text[]) AS t(course_id, status)`,
    [userId, statusRows.map(row => row[0]), statusRows.map(row => row[1])],
  );

  // Quy định tốt nghiệp đã đạt: tất cả, hoặc theo tên.
  const allRegulations = SCENARIO.regulations === 'all';
  const regulations = await client.query(
    `INSERT INTO student_regulation_statuses (user_id, regulation_id, status)
     SELECT $1, id, 'completed' FROM curriculum_regulations
     WHERE curriculum_id = $2 AND ($3::boolean OR name = ANY($4::text[])) RETURNING id`,
    [userId, curriculum.id, allRegulations, allRegulations ? [] : SCENARIO.regulations],
  );
  if (!allRegulations && regulations.rowCount !== SCENARIO.regulations.length) {
    throw new Error(`Chỉ khớp ${regulations.rowCount}/${SCENARIO.regulations.length} quy định theo tên`);
  }

  await client.query(dryRun ? 'ROLLBACK' : 'COMMIT');
  console.log(`${dryRun ? '[dry-run, đã rollback] ' : ''}${existing ? 'Cập nhật' : 'Tạo'} sinh viên ${EMAIL} (id: ${userId}), kịch bản ${SCENARIO_NAME}`);
  console.log(`  Chương trình: ${CURRICULUM_CODE}, khóa ${PROFILE.admission_year}, MSSV ${PROFILE.student_number}`);
  console.log(`  Môn đã xong: ${COMPLETED.length}, đang học: ${IN_PROGRESS.length}, chưa đạt: ${FAILED.length}, quy định đã đạt: ${regulations.rowCount}`);
  console.log(`  Mật khẩu: ${arg('password') ? '(giá trị --password)' : PASSWORD}`);
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('SEED THẤT BẠI:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await client.end();
}
