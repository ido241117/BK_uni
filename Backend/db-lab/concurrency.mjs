// 4.4 Kiểm soát đồng thời: điều khiển nhiều phiên PostgreSQL xen kẽ theo thứ tự định trước.
// Dùng: node db-lab/concurrency.mjs   (chạy trong thư mục Backend; kết quả ở db-lab/results/44-concurrency.txt)
// Chỉ đụng tới schema thử nghiệm bk_lab (tạo khi bắt đầu, xóa khi kết thúc).
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, '../package.json'));
require('dotenv').config({ path: join(here, '../.env') });
const { Client } = require('pg');

const config = {
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD, database: process.env.DB_NAME, ssl: { rejectUnauthorized: false },
};
const out = [];
const log = (line = '') => { console.log(line); out.push(line); };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function session(name) {
  const client = new Client({ ...config, application_name: `bk_lab_${name}` });
  await client.connect();
  // Pooler Supavisor ghi đè application_name lúc kết nối, nên đặt lại sau khi đã vào phiên.
  await client.query(`SET search_path = bk_lab; SET application_name = 'bk_lab_${name}'; SET statement_timeout = '30s'`);
  const run = async (sql, params) => {
    const started = Date.now();
    try {
      const result = await client.query(sql, params);
      const rows = result.rows?.length ? ' -> ' + JSON.stringify(result.rows.length === 1 ? result.rows[0] : result.rows) : '';
      const waited = Date.now() - started > 300 ? `  (chờ ${Date.now() - started} ms)` : '';
      log(`  [${name}] ${sql}${rows}${waited}`);
      return result.rows;
    } catch (error) {
      log(`  [${name}] ${sql}  !! ${error.code} ${error.message}  (sau ${Date.now() - started} ms)`);
      error.logged = true;
      throw error;
    }
  };
  return { name, client, run, pid: (await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid };
}
const swallow = promise => promise.catch(error => { if (!error.logged) throw error; return error; });
const title = text => { log(); log(`=== ${text} ===`); };

async function main() {
  const admin = await session('setup');
  await admin.client.query('DROP SCHEMA IF EXISTS bk_lab CASCADE; CREATE SCHEMA bk_lab');
  await admin.client.query(`
    CREATE TABLE bk_lab.student (id int PRIMARY KEY, name text, gpa numeric(3,2), credits int);
    INSERT INTO bk_lab.student VALUES (1, 'An', 3.20, 60), (2, 'Bình', 2.80, 45), (3, 'Chi', 3.60, 90);
    CREATE TABLE bk_lab.plan (student int, course text, credits int, PRIMARY KEY (student, course));
    INSERT INTO bk_lab.plan VALUES (1, 'CO1007', 4), (1, 'MT1003', 4), (1, 'PH1003', 4), (1, 'CO2003', 4), (1, 'CO2011', 4);
    CREATE TABLE bk_lab.student_courses (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, user_id int, course_id int,
      status text, CONSTRAINT uq UNIQUE (user_id, course_id));
    CREATE TABLE bk_lab.courses (id int PRIMARY KEY, code text);
    INSERT INTO bk_lab.courses SELECT g, 'C' || g FROM generate_series(1, 50) g;
    CREATE TABLE bk_lab.opened (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, course_id int REFERENCES bk_lab.courses,
      semester_code text, CONSTRAINT uq_opened UNIQUE (course_id, semester_code));
  `);
  const A = await session('A');
  const B = await session('B');

  // 1. Dirty read: PostgreSQL không bao giờ cho đọc dữ liệu chưa commit, kể cả khi xin READ UNCOMMITTED.
  title('1. Dirty read (READ UNCOMMITTED được xử lý như READ COMMITTED)');
  await A.run('BEGIN');
  await A.run('UPDATE student SET gpa = 4.00 WHERE id = 1');
  await B.run('BEGIN ISOLATION LEVEL READ UNCOMMITTED');
  await B.run('SELECT gpa FROM student WHERE id = 1');
  await A.run('ROLLBACK');
  await B.run('COMMIT');

  // 2. Non-repeatable read: có ở READ COMMITTED, không có ở REPEATABLE READ.
  for (const level of ['READ COMMITTED', 'REPEATABLE READ']) {
    title(`2. Non-repeatable read ở ${level}`);
    await A.run(`BEGIN ISOLATION LEVEL ${level}`);
    await A.run('SELECT gpa FROM student WHERE id = 2');
    await B.run('UPDATE student SET gpa = gpa + 0.10 WHERE id = 2');
    await A.run('SELECT gpa FROM student WHERE id = 2');
    await A.run('COMMIT');
  }

  // 3. Phantom read: tập dòng thỏa điều kiện thay đổi giữa hai lần đọc.
  for (const level of ['READ COMMITTED', 'REPEATABLE READ']) {
    title(`3. Phantom read ở ${level}`);
    await A.run(`BEGIN ISOLATION LEVEL ${level}`);
    await A.run('SELECT count(*) AS so_sv_gioi FROM student WHERE gpa >= 3.2');
    await B.run(`INSERT INTO student VALUES (${level === 'READ COMMITTED' ? 4 : 5}, 'Dũng', 3.90, 100)`);
    await A.run('SELECT count(*) AS so_sv_gioi FROM student WHERE gpa >= 3.2');
    await A.run('COMMIT');
  }

  // 4. Lost update: hai phiên cùng đọc rồi ghi đè (read-modify-write ở tầng ứng dụng).
  const lostUpdate = async (label, begin, select) => {
    title(`4. Lost update: ${label}`);
    await A.client.query('UPDATE student SET credits = 60 WHERE id = 1');
    await A.run(begin);
    await B.run(begin);
    const [{ credits: a }] = await A.run(select);
    const pendingB = swallow(B.run(select));
    await sleep(500);
    await A.run(`UPDATE student SET credits = ${a + 4} WHERE id = 1`);
    await A.run('COMMIT');
    const rowsB = await pendingB;
    if (rowsB instanceof Error) { await B.run('ROLLBACK'); }
    else {
      const result = await swallow(B.run(`UPDATE student SET credits = ${rowsB[0].credits + 3} WHERE id = 1`));
      await B.run(result instanceof Error ? 'ROLLBACK' : 'COMMIT');
    }
    await A.run('SELECT credits AS ket_qua FROM student WHERE id = 1');
  };
  await lostUpdate('READ COMMITTED, đọc thường -> mất cập nhật của A (mong đợi 67)', 'BEGIN', 'SELECT credits FROM student WHERE id = 1');
  await lostUpdate('READ COMMITTED + SELECT ... FOR UPDATE (khóa bi quan)', 'BEGIN', 'SELECT credits FROM student WHERE id = 1 FOR UPDATE');
  {
    title('4. Lost update: REPEATABLE READ -> phiên ghi sau bị hủy với lỗi 40001');
    await A.client.query('UPDATE student SET credits = 60 WHERE id = 1');
    await A.run('BEGIN ISOLATION LEVEL REPEATABLE READ');
    await B.run('BEGIN ISOLATION LEVEL REPEATABLE READ');
    await A.run('SELECT credits FROM student WHERE id = 1');
    await B.run('SELECT credits FROM student WHERE id = 1');
    await A.run('UPDATE student SET credits = 64 WHERE id = 1');
    const pending = swallow(B.run('UPDATE student SET credits = 63 WHERE id = 1'));
    await sleep(500);
    await A.run('COMMIT');
    await pending;
    await B.run('ROLLBACK');
    await A.run('SELECT credits AS ket_qua FROM student WHERE id = 1');
  }
  {
    title('4. Lost update: cập nhật nguyên tử trong một câu lệnh (credits = credits + n)');
    await A.client.query('UPDATE student SET credits = 60 WHERE id = 1');
    await A.run('BEGIN');
    await B.run('BEGIN');
    await A.run('UPDATE student SET credits = credits + 4 WHERE id = 1');
    const pending = swallow(B.run('UPDATE student SET credits = credits + 3 WHERE id = 1'));
    await sleep(500);
    await A.run('COMMIT');
    await pending;
    await B.run('COMMIT');
    await A.run('SELECT credits AS ket_qua FROM student WHERE id = 1');
  }

  // 5. Write skew: ràng buộc "tổng tín chỉ một học kỳ <= 24" chỉ được kiểm ở ứng dụng.
  for (const level of ['REPEATABLE READ', 'SERIALIZABLE']) {
    title(`5. Write skew ở ${level} (giới hạn 24 tín chỉ/học kỳ, đang có 20)`);
    await A.client.query("DELETE FROM plan WHERE course IN ('CO2013', 'CO2039')");
    await A.run(`BEGIN ISOLATION LEVEL ${level}`);
    await B.run(`BEGIN ISOLATION LEVEL ${level}`);
    await A.run('SELECT sum(credits) AS tong FROM plan WHERE student = 1');
    await B.run('SELECT sum(credits) AS tong FROM plan WHERE student = 1');
    await A.run("INSERT INTO plan VALUES (1, 'CO2013', 4)");
    await B.run("INSERT INTO plan VALUES (1, 'CO2039', 4)");
    await A.run('COMMIT');
    const result = await swallow(B.run('COMMIT'));
    if (result instanceof Error) await B.run('ROLLBACK');
    await A.run('SELECT sum(credits) AS tong_sau FROM plan WHERE student = 1');
  }

  // 6. Deadlock: hai phiên khóa hai dòng theo thứ tự ngược nhau.
  {
    title('6. Deadlock và cơ chế phát hiện (deadlock_timeout)');
    await A.run('SHOW deadlock_timeout');
    await A.run('BEGIN');
    await B.run('BEGIN');
    await A.run('UPDATE student SET credits = credits + 1 WHERE id = 1');
    await B.run('UPDATE student SET credits = credits + 1 WHERE id = 2');
    const pendingA = swallow(A.run('UPDATE student SET credits = credits + 1 WHERE id = 2'));
    await sleep(300);
    const pendingB = swallow(B.run('UPDATE student SET credits = credits + 1 WHERE id = 1'));
    const [ra, rb] = await Promise.all([pendingA, pendingB]);
    await A.run(ra instanceof Error ? 'ROLLBACK' : 'COMMIT');
    await B.run(rb instanceof Error ? 'ROLLBACK' : 'COMMIT');
  }

  // 7. Quan sát khóa: phiên B chờ khóa dòng của A; phiên thứ ba đọc pg_locks / pg_stat_activity.
  {
    title('7. Quan sát khóa đang chờ (pg_stat_activity, pg_blocking_pids, pg_locks)');
    await A.run('BEGIN');
    await A.run('SELECT * FROM student WHERE id = 3 FOR UPDATE');
    await B.run('BEGIN');
    const pending = swallow(B.run('UPDATE student SET gpa = 3.70 WHERE id = 3'));
    await sleep(500);
    log(`  (pid A = ${A.pid}, pid B = ${B.pid})`);
    const pids = [A.pid, B.pid];
    await admin.run(`SELECT pid, application_name, state, wait_event_type, wait_event, pg_blocking_pids(pid) AS bi_chan_boi
                     FROM pg_stat_activity WHERE pid = ANY($1) ORDER BY pid`, [pids]);
    await admin.run(`SELECT l.pid, l.locktype, l.mode, l.granted
                     FROM pg_locks l WHERE l.pid = ANY($1) AND l.locktype IN ('tuple', 'transactionid')
                     ORDER BY l.pid, l.locktype`, [pids]);
    // MVCC: người đọc không bị người ghi chặn (đọc từ phiên thứ ba trong lúc A còn giữ khóa)
    await admin.run("SELECT 'đọc không bị chặn' AS mvcc, gpa FROM bk_lab.student WHERE id = 3");
    await A.run('COMMIT');
    await pending;
    await B.run('COMMIT');
  }

  // 8. Lỗi thật của ứng dụng (StudentService): "đọc xem đã có chưa rồi INSERT" vs INSERT ... ON CONFLICT.
  const race = async (label, fn, workers = 8, rounds = 40) => {
    const clients = await Promise.all(Array.from({ length: workers }, (_, i) => session(`w${i}`)));
    for (const c of clients) c.run = (sql, params) => c.client.query(sql, params);
    await admin.client.query('TRUNCATE student_courses');
    let errors = 0; const codes = {};
    const started = Date.now();
    for (let round = 0; round < rounds; round++) {
      const results = await Promise.allSettled(clients.map(c => fn(c, round)));
      for (const r of results) if (r.status === 'rejected') { errors++; codes[r.reason.code] = (codes[r.reason.code] ?? 0) + 1; }
    }
    const [{ rows }] = [await admin.client.query('SELECT count(*)::int AS n FROM student_courses')];
    log(`  ${label}: ${workers} phiên x ${rounds} lượt = ${workers * rounds} yêu cầu, lỗi = ${errors} ${JSON.stringify(codes)}, ` +
      `số dòng = ${rows[0].n} (đúng phải là ${rounds}), ${Date.now() - started} ms`);
    await Promise.all(clients.map(c => c.client.end()));
  };
  title('8. Race của StudentService: 8 request cùng khai trạng thái cho cùng (user, môn)');
  await race('Cách cũ  (SELECT rồi INSERT/UPDATE trong transaction)', async (c, round) => {
    await c.run('BEGIN');
    try {
      const { rows } = await c.run('SELECT id FROM student_courses WHERE user_id = 1 AND course_id = $1', [round]);
      if (rows.length) await c.run("UPDATE student_courses SET status = 'completed' WHERE id = $1", [rows[0].id]);
      else await c.run("INSERT INTO student_courses (user_id, course_id, status) VALUES (1, $1, 'completed')", [round]);
      await c.run('COMMIT');
    } catch (error) { await c.run('ROLLBACK'); throw error; }
  });
  await race('Cách mới (INSERT ... ON CONFLICT DO UPDATE)', async (c, round) => {
    await c.run('BEGIN');
    try {
      await c.run(`INSERT INTO student_courses (user_id, course_id, status) VALUES (1, $1, 'completed')
                   ON CONFLICT (user_id, course_id) DO UPDATE SET status = EXCLUDED.status`, [round]);
      await c.run('COMMIT');
    } catch (error) { await c.run('ROLLBACK'); throw error; }
  });

  // 9. Lỗi thật của ứng dụng (CourseService.replaceOpenedSemesters): DELETE + INSERT đồng thời.
  const replace = lock => async (c, round) => {
    const course = (round % 50) + 1;
    await c.run('BEGIN');
    try {
      if (lock) await c.run('SELECT id FROM courses WHERE id = $1 FOR UPDATE', [course]);
      await c.run('DELETE FROM opened WHERE course_id = $1', [course]);
      await c.run("INSERT INTO opened (course_id, semester_code) VALUES ($1, '251'), ($1, '252')", [course]);
      await c.run('COMMIT');
    } catch (error) { await c.run('ROLLBACK'); throw error; }
  };
  title('9. Race của CourseService.replaceOpenedSemesters: 8 admin cùng thay học kỳ mở của một môn');
  const raceOpened = async (label, fn) => {
    const clients = await Promise.all(Array.from({ length: 8 }, (_, i) => session(`r${i}`)));
    for (const c of clients) c.run = (sql, params) => c.client.query(sql, params);
    await admin.client.query('TRUNCATE opened');
    let errors = 0; const codes = {};
    const started = Date.now();
    for (let round = 0; round < 40; round++) {
      const results = await Promise.allSettled(clients.map(c => fn(c, round)));
      for (const r of results) if (r.status === 'rejected') { errors++; codes[r.reason.code] = (codes[r.reason.code] ?? 0) + 1; }
    }
    log(`  ${label}: 320 yêu cầu, lỗi = ${errors} ${JSON.stringify(codes)}, ${Date.now() - started} ms`);
    await Promise.all(clients.map(c => c.client.end()));
  };
  await raceOpened('Không khóa              ', replace(false));
  await raceOpened('SELECT ... FOR UPDATE môn', replace(true));

  // 10. Advisory lock (OutlineImportService): phiên thứ hai phải chờ hoặc biết ngay là đang bị giữ.
  title('10. Advisory lock dùng cho nhập đề cương (pg_advisory_xact_lock)');
  await A.run('BEGIN');
  await A.run('SELECT pg_advisory_xact_lock(7420001)');
  await B.run('SELECT pg_try_advisory_xact_lock(7420001) AS lay_duoc_khoa');
  const waiting = swallow(B.run('SELECT pg_advisory_xact_lock(7420001)'));
  await sleep(800);
  await A.run('COMMIT');
  await waiting;

  await admin.client.query('DROP SCHEMA bk_lab CASCADE');
  await Promise.all([A, B, admin].map(s => s.client.end()));
  writeFileSync(join(here, 'results/44-concurrency.txt'), out.join('\n') + '\n');
}

main().catch(error => { console.error(error); process.exit(1); });
