#!/usr/bin/env node
/**
 * Tao mot chuong trinh dao tao HOAN CHINH qua HTTP API cua BK Uni, dung thu tu phu thuoc.
 *
 * Vi sao can script: API khong co endpoint "tao ca chuong trinh trong mot request". Moi manh du
 * lieu la mot endpoint rieng va co khoa ngoai, nen thu tu goi bat buoc la:
 *
 *   1. POST /auth/login                      -> lay cookie phien ADMIN
 *   2. POST /courses (+ PUT opened-semesters) -> mon hoc phai ton tai truoc
 *   3. POST /curricula                        -> tao vo chuong trinh
 *   4. POST /curricula/:id/courses            -> dua mon vao chuong trinh
 *   5. POST /curricula/:id/groups             -> nhom mon (thanh vien phai la mon cua chuong trinh)
 *      POST /curricula/:id/categories         -> nhom hoc phan (the mo ta, khong rang buoc; 1 mon thuoc nhieu nhom)
 *      POST /curricula/:id/specializations    -> chuyen nganh (khong bat buoc)
 *      POST /curricula/:id/groups             -> khoi chuyen nganh: thu hep 1 khoi goc (specialization_id + parent_group_id);
 *                                                mot chuyen nganh co the co nhieu khoi con tren cung khoi goc, khong trung mon
 *   6. PUT  /curricula/:id/courses/:cid/relations -> tien quyet/khuyen nghi (2 dau phai thuoc chuong trinh)
 *   7. POST /curricula/:id/regulations        -> quy dinh dao tao
 *
 * Script chay lai duoc nhieu lan (idempotent):
 *   - mon hoc trung ma  -> dung lai mon da co (GET /courses/by-code/:code)
 *   - chuong trinh trung ma -> dung lai chuong trinh da co
 *   - mon trong chuong trinh -> POST la upsert (cap nhat nam/ky)
 *   - nhom mon trung ten -> PATCH + PUT thanh vien
 *   - quan he -> PUT thay the toan bo
 *   - quy dinh trung ten -> PATCH chi tiet
 *   - chuyen nganh trung ma -> PATCH; khoi chuyen nganh trung ten (cung khoi goc) -> PATCH + thanh vien
 *
 * Chuyen nganh KHONG cong tin chi: khoi chuyen nganh chi la tap con cua khoi goc. Tong tin chi tot nghiep
 * chi tinh tren khoi goc (specialization_id = null).
 *
 * Cach dung:
 *   node scripts/create-curriculum.mjs --dry-run
 *   node scripts/create-curriculum.mjs
 *   node scripts/create-curriculum.mjs --data=duong/dan/khac.json --remove-after
 *
 * Tuy chon:
 *   --data=<file>     file JSON dinh nghia chuong trinh (mac dinh scripts/sample-curriculum.json)
 *   --base-url=<url>  mac dinh http://localhost:3210/api
 *   --origin=<url>    phai thuoc CORS_ORIGINS, mac dinh http://localhost:5173
 *   --email=<email>   tai khoan ADMIN, mac dinh admin@bkuni.local
 *   --password=<pw>   mat khau ADMIN, mac dinh Admin@123456
 *   --dry-run         chi kiem tra du lieu va in ke hoach, khong ghi gi
 *   --remove-after    xoa chuong trinh + cac mon do lan chay nay tao ra khi ket thuc
 *   --prune           xoa nhom mon, chuyen nganh, nhom hoc phan, quy dinh co trong DB nhung khong co trong file
 */

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const GROUP_KINDS = new Set(['required', 'elective']);
const GROUP_SCOPES = new Set(['listed', 'any']);
const SEMESTER_PATTERN = /^\d{2}[123]$/;
/** [truong trong file JSON, truong cua API]: TQ, HT, SHT, KN. */
const RELATION_FIELDS = [
  ['prerequisite_course_codes', 'prerequisite_course_ids'],
  ['prior_course_codes', 'prior_course_ids'],
  ['corequisite_course_codes', 'corequisite_course_ids'],
  ['recommended_course_codes', 'recommended_course_ids'],
];

/* ------------------------------- tham so CLI ------------------------------- */

const argv = process.argv.slice(2);
const options = new Map();
for (const item of argv) {
  if (!item.startsWith('--')) fail(`Tham so khong hop le: ${item}`);
  const [key, ...rest] = item.slice(2).split('=');
  options.set(key, rest.length ? rest.join('=') : true);
}

const config = {
  baseUrl: String(options.get('base-url') ?? process.env.BK_API_URL ?? 'http://localhost:3210/api').replace(/\/+$/, ''),
  origin: String(options.get('origin') ?? process.env.BK_WEB_ORIGIN ?? 'http://localhost:5173'),
  email: String(options.get('email') ?? process.env.BK_ADMIN_EMAIL ?? 'admin@bkuni.local'),
  password: String(options.get('password') ?? process.env.BK_ADMIN_PASSWORD ?? 'Admin@123456'),
  dataFile: options.has('data')
    ? resolve(process.cwd(), String(options.get('data')))
    : resolve(SCRIPT_DIR, 'sample-curriculum.json'),
  dryRun: options.has('dry-run'),
  removeAfter: options.has('remove-after'),
  prune: options.has('prune'),
};

/* --------------------------------- tien ich -------------------------------- */

let step = 0;

function log(message) {
  process.stdout.write(`${message}\n`);
}

function heading(message) {
  step += 1;
  log(`\n[${step}] ${message}`);
}

function fail(message) {
  process.stderr.write(`\nLOI: ${message}\n`);
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

class ApiError extends Error {
  constructor(status, message, method, path) {
    super(`${method} ${path} -> ${status}: ${message}`);
    this.status = status;
    this.apiMessage = message;
  }
}

/* ---------------------------------- HTTP ---------------------------------- */

class Api {
  constructor({ baseUrl, origin }) {
    this.baseUrl = baseUrl;
    this.origin = origin;
    this.cookie = null;
  }

  async call(method, path, body) {
    const headers = { Origin: this.origin, Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.cookie) headers.Cookie = this.cookie;

    let response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (cause) {
      fail(`Khong ket noi duoc ${this.baseUrl}. Backend da chay chua? (${cause.message})`);
    }

    const setCookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
    const session = setCookies.find((value) => value.startsWith('accessToken='));
    if (session) this.cookie = session.split(';')[0];

    const text = await response.text();
    let payload = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { message: text };
      }
    }

    if (!response.ok) {
      throw new ApiError(response.status, payload?.message ?? response.statusText, method, path);
    }
    return payload?.data ?? null;
  }

  get(path) {
    return this.call('GET', path);
  }

  post(path, body) {
    return this.call('POST', path, body);
  }

  patch(path, body) {
    return this.call('PATCH', path, body);
  }

  put(path, body) {
    return this.call('PUT', path, body);
  }

  delete(path) {
    return this.call('DELETE', path);
  }
}

/* ------------------------------- kiem tra du lieu ------------------------------ */

function isInteger(value) {
  return typeof value === 'number' && Number.isInteger(value);
}

function checkString(errors, value, label, maxLength) {
  if (typeof value !== 'string' || !value.trim()) {
    errors.push(`${label} phai la chuoi khac rong`);
    return;
  }
  if (value.length > maxLength) errors.push(`${label} dai qua ${maxLength} ky tu`);
}

function normalize(text) {
  return String(text).trim().toLowerCase();
}

/**
 * Kiem tra toan bo du lieu dau vao TRUOC khi ghi bat ky dong nao.
 * Muc dich: khong de lai chuong trinh nua voi (API khong co transaction xuyen request).
 */
function validatePlan(plan) {
  const errors = [];
  for (const field of ['courses', 'curriculum_courses', 'groups', 'specializations', 'categories', 'relations', 'regulations']) {
    if (plan[field] == null) plan[field] = [];
  }
  const curriculum = plan.curriculum;
  if (!curriculum || typeof curriculum !== 'object') fail('File du lieu thieu "curriculum"');
  if (!Array.isArray(plan.courses)) errors.push('"courses" phai la mang');

  checkString(errors, curriculum.code, 'curriculum.code', 50);
  checkString(errors, curriculum.name, 'curriculum.name', 255);
  checkString(errors, curriculum.major, 'curriculum.major', 255);
  checkString(errors, curriculum.faculty, 'curriculum.faculty', 255);

  if (!isInteger(curriculum.cohort) || curriculum.cohort < 2000 || curriculum.cohort > 2099) {
    errors.push('curriculum.cohort phai la so nguyen 2000..2099 (khoa tuyen sinh)');
  }
  if (!isInteger(curriculum.duration_years) || curriculum.duration_years < 1) {
    errors.push('curriculum.duration_years phai la so nguyen >= 1');
  }
  if (!isInteger(curriculum.min_semester_credits) || curriculum.min_semester_credits < 0) {
    errors.push('curriculum.min_semester_credits phai la so nguyen >= 0');
  }
  if (!isInteger(curriculum.max_semester_credits) || curriculum.max_semester_credits < 1) {
    errors.push('curriculum.max_semester_credits phai la so nguyen >= 1');
  }
  if (
    isInteger(curriculum.min_semester_credits) && isInteger(curriculum.max_semester_credits) &&
    curriculum.max_semester_credits < curriculum.min_semester_credits
  ) {
    errors.push('curriculum.max_semester_credits phai >= min_semester_credits');
  }
  if (curriculum.description != null && typeof curriculum.description !== 'string') {
    errors.push('curriculum.description phai la chuoi hoac null');
  }

  const courses = Array.isArray(plan.courses) ? plan.courses : [];
  const courseByCode = new Map();
  for (const [index, course] of courses.entries()) {
    const label = `courses[${index}]`;
    checkString(errors, course.code, `${label}.code`, 50);
    checkString(errors, course.name, `${label}.name`, 255);
    if (!isInteger(course.credits) || course.credits < 0) errors.push(`${label}.credits phai la so nguyen >= 0`);
    if (course.opened_semesters != null) {
      if (!Array.isArray(course.opened_semesters)) {
        errors.push(`${label}.opened_semesters phai la mang ma hoc ky`);
      } else {
        for (const code of course.opened_semesters) {
          if (typeof code !== 'string' || !SEMESTER_PATTERN.test(code)) {
            errors.push(`${label}.opened_semesters: "${code}" khong dung dinh dang YYK (ky 1..3, vd 251)`);
          }
        }
      }
    }
    const key = typeof course.code === 'string' ? normalize(course.code) : '';
    if (key && courseByCode.has(key)) errors.push(`${label}.code trung ma "${course.code}"`);
    if (key) courseByCode.set(key, course);
  }

  const assignments = Array.isArray(plan.curriculum_courses) ? plan.curriculum_courses : [];
  const assigned = new Set();
  for (const [index, item] of assignments.entries()) {
    const label = `curriculum_courses[${index}]`;
    const key = typeof item.course_code === 'string' ? normalize(item.course_code) : '';
    if (!courseByCode.has(key)) {
      errors.push(`${label}.course_code "${item.course_code}" khong co trong "courses"`);
      continue;
    }
    if (assigned.has(key)) errors.push(`${label}.course_code "${item.course_code}" bi lap`);
    assigned.add(key);
    const hasYear = item.recommended_year != null;
    const hasTerm = item.recommended_term != null;
    if (hasYear !== hasTerm) {
      errors.push(`${label}: recommended_year va recommended_term phai cung co hoac cung bo trong (mon chua xep ky)`);
    }
    if (hasYear && (!isInteger(item.recommended_year) || item.recommended_year < 1)) {
      errors.push(`${label}.recommended_year phai la so nguyen >= 1`);
    }
    if (hasTerm && (!isInteger(item.recommended_term) || ![1, 2, 3].includes(item.recommended_term))) {
      errors.push(`${label}.recommended_term phai la 1, 2 hoac 3`);
    }
    if (hasYear && isInteger(item.recommended_year) && isInteger(curriculum.duration_years) &&
        item.recommended_year > curriculum.duration_years) {
      errors.push(
        `${label}.recommended_year (${item.recommended_year}) vuot duration_years (${curriculum.duration_years})`,
      );
    }
    if (hasYear && hasTerm && item.recommended_term === 3) {
      // chi canh bao: mot so chuong trinh xep mon hoc ky he khong theo nam hoc chuan
      log(`  ! ${item.course_code}: recommended_term = 3 (hoc ky he) - kiem tra lai neu khong dung y dinh`);
    }
  }

  const groups = Array.isArray(plan.groups) ? plan.groups : [];
  const groupNames = new Set();
  const rootGroups = new Map();
  const groupedCourses = new Set();
  for (const [index, group] of groups.entries()) {
    const label = `groups[${index}]`;
    checkString(errors, group.name, `${label}.name`, 255);
    if (!GROUP_KINDS.has(group.kind)) errors.push(`${label}.kind phai la "required" hoac "elective"`);

    const scope = group.pool_scope ?? 'listed';
    if (!GROUP_SCOPES.has(scope)) errors.push(`${label}.pool_scope phai la "listed" hoac "any"`);
    const hasCount = group.required_count != null;
    const hasCredits = group.required_credits != null;
    if (!hasCount && !hasCredits) {
      errors.push(`${label}: phai co required_count hoac required_credits`);
    }
    if (hasCount && (!isInteger(group.required_count) || group.required_count < 1)) {
      errors.push(`${label}.required_count phai la so nguyen >= 1`);
    }
    if (hasCredits && (!isInteger(group.required_credits) || group.required_credits < 1)) {
      errors.push(`${label}.required_credits phai la so nguyen >= 1`);
    }
    if (group.pool_course_credits != null && (!isInteger(group.pool_course_credits) || group.pool_course_credits < 1)) {
      errors.push(`${label}.pool_course_credits phai la so nguyen >= 1`);
    }

    const nameKey = typeof group.name === 'string' ? normalize(group.name) : '';
    if (nameKey && groupNames.has(nameKey)) errors.push(`${label}.name trung ten nhom "${group.name}"`);
    if (nameKey) groupNames.add(nameKey);

    const memberCodes = Array.isArray(group.course_codes) ? group.course_codes : [];
    if (!Array.isArray(group.course_codes)) errors.push(`${label}.course_codes phai la mang`);
    if (nameKey) rootGroups.set(nameKey, { scope, codes: new Set(memberCodes.map(normalize)) });
    if (scope === 'any') {
      if (memberCodes.length) errors.push(`${label}: khoi "any" khong nhan course_codes`);
      if (!hasCredits) errors.push(`${label}: khoi "any" phai co required_credits`);
    }
    for (const code of memberCodes) {
      const key = typeof code === 'string' ? normalize(code) : '';
      if (!assigned.has(key)) {
        errors.push(`${label}.course_codes "${code}" chua co trong curriculum_courses (phai dua mon vao chuong trinh truoc)`);
        continue;
      }
      if (groupedCourses.has(key)) {
        errors.push(`mon "${code}" nam trong 2 nhom cung chuong trinh - kiem tra lai du lieu`);
      }
      groupedCourses.add(key);
    }
    if (hasCount && memberCodes.length && group.required_count > memberCodes.length) {
      errors.push(`${label}.required_count (${group.required_count}) > so mon cua nhom (${memberCodes.length})`);
    }
    if (group.kind === 'required' && hasCount && group.required_count < memberCodes.length) {
      log(`  ! ${group.name}: nhom "required" nhung required_count < so thanh vien - kiem tra lai`);
    }
  }

  const specializations = Array.isArray(plan.specializations) ? plan.specializations : [];
  const specializationCodes = new Set();
  let specializationGroupCount = 0;
  for (const [index, specialization] of specializations.entries()) {
    const label = `specializations[${index}]`;
    checkString(errors, specialization.code, `${label}.code`, 50);
    checkString(errors, specialization.name, `${label}.name`, 255);
    if (specialization.description != null && typeof specialization.description !== 'string') {
      errors.push(`${label}.description phai la chuoi hoac null`);
    }
    const codeKey = typeof specialization.code === 'string' ? normalize(specialization.code) : '';
    if (codeKey && specializationCodes.has(codeKey)) errors.push(`${label}.code trung ma chuyen nganh "${specialization.code}"`);
    if (codeKey) specializationCodes.add(codeKey);

    const specGroups = Array.isArray(specialization.groups) ? specialization.groups : [];
    if (!Array.isArray(specialization.groups)) errors.push(`${label}.groups phai la mang`);
    // Nhieu khoi con tren cung khoi goc duoc phep (vd "bat buoc" + "tu chon") nhung khong trung mon.
    const usedByParent = new Map();
    for (const [groupIndex, group] of specGroups.entries()) {
      const groupLabel = `${label}.groups[${groupIndex}]`;
      specializationGroupCount += 1;
      checkString(errors, group.name, `${groupLabel}.name`, 255);
      const nameKey = typeof group.name === 'string' ? normalize(group.name) : '';
      if (nameKey && groupNames.has(nameKey)) errors.push(`${groupLabel}.name trung ten nhom "${group.name}"`);
      if (nameKey) groupNames.add(nameKey);

      const parentKey = typeof group.parent_group === 'string' ? normalize(group.parent_group) : '';
      const parent = rootGroups.get(parentKey);
      if (!parent) {
        errors.push(`${groupLabel}.parent_group "${group.parent_group}" khong phai ten mot khoi goc trong "groups"`);
        continue;
      }
      if (parent.scope !== 'listed') errors.push(`${groupLabel}: chi thu hep duoc khoi goc "listed"`);
      if (!Array.isArray(group.course_codes)) {
        errors.push(`${groupLabel}.course_codes phai la mang`);
        continue;
      }
      const used = usedByParent.get(parentKey) ?? new Map();
      usedByParent.set(parentKey, used);
      for (const code of group.course_codes) {
        const key = normalize(code);
        if (used.has(key)) {
          errors.push(`${groupLabel}.course_codes "${code}" da thuoc khoi "${used.get(key)}" cung chuyen nganh va khoi goc`);
        }
        used.set(key, group.name);
        if (!parent.codes.has(normalize(code))) {
          errors.push(`${groupLabel}.course_codes "${code}" khong thuoc khoi goc "${group.parent_group}"`);
        }
      }
      for (const field of ['required_count', 'required_credits']) {
        if (group[field] != null && (!isInteger(group[field]) || group[field] < 1)) {
          errors.push(`${groupLabel}.${field} phai la so nguyen >= 1 (bo trong de ke thua khoi goc)`);
        }
      }
    }
  }

  const categories = Array.isArray(plan.categories) ? plan.categories : [];
  const categoryNames = new Set();
  for (const [index, category] of categories.entries()) {
    const label = `categories[${index}]`;
    checkString(errors, category.name, `${label}.name`, 255);
    const nameKey = typeof category.name === 'string' ? normalize(category.name) : '';
    if (nameKey && categoryNames.has(nameKey)) errors.push(`${label}.name trung ten nhom hoc phan "${category.name}"`);
    if (nameKey) categoryNames.add(nameKey);
    if (!Array.isArray(category.course_codes)) {
      errors.push(`${label}.course_codes phai la mang`);
      continue;
    }
    const seen = new Set();
    for (const code of category.course_codes) {
      const key = typeof code === 'string' ? normalize(code) : '';
      if (!assigned.has(key)) errors.push(`${label}.course_codes "${code}" chua co trong curriculum_courses`);
      if (seen.has(key)) errors.push(`${label}.course_codes "${code}" bi lap`);
      seen.add(key);
    }
  }

  const relations = Array.isArray(plan.relations) ? plan.relations : [];
  for (const [index, item] of relations.entries()) {
    const label = `relations[${index}]`;
    const key = typeof item.course_code === 'string' ? normalize(item.course_code) : '';
    if (!assigned.has(key)) {
      errors.push(`${label}.course_code "${item.course_code}" chua co trong curriculum_courses`);
      continue;
    }
    for (const field of RELATION_FIELDS.map(([codes]) => codes)) {
      const list = item[field];
      if (list == null) continue;
      if (!Array.isArray(list)) {
        errors.push(`${label}.${field} phai la mang`);
        continue;
      }
      for (const code of list) {
        const relatedKey = typeof code === 'string' ? normalize(code) : '';
        if (!assigned.has(relatedKey)) {
          errors.push(`${label}.${field} "${code}" chua co trong curriculum_courses (2 dau quan he phai thuoc chuong trinh)`);
        }
        if (relatedKey === key) errors.push(`${label}.${field} "${code}": mon khong the quan he voi chinh no`);
      }
    }
  }

  const regulations = Array.isArray(plan.regulations) ? plan.regulations : [];
  const regulationNames = new Set();
  for (const [index, regulation] of regulations.entries()) {
    const label = `regulations[${index}]`;
    checkString(errors, regulation.name, `${label}.name`, 255);
    if (regulation.detail != null && typeof regulation.detail !== 'string') {
      errors.push(`${label}.detail phai la chuoi hoac null`);
    }
    const nameKey = typeof regulation.name === 'string' ? normalize(regulation.name) : '';
    if (nameKey && regulationNames.has(nameKey)) errors.push(`${label}.name trung ten quy dinh`);
    if (nameKey) regulationNames.add(nameKey);
  }

  if (errors.length) {
    fail(`Du lieu khong hop le:\n  - ${errors.join('\n  - ')}`);
  }

  return {
    courseByCode, assigned: [...assigned], groupNames, groupCount: groups.length,
    specializationCount: specializations.length, specializationGroupCount,
    categoryCount: categories.length, regulationCount: regulations.length,
  };
}

/* --------------------------------- cac buoi -------------------------------- */

async function login(api) {
  const account = await api.post('/auth/login', { email: config.email, password: config.password });
  assert(account?.role === 'ADMIN', `Tai khoan ${config.email} khong phai ADMIN (role=${account?.role})`);
  log(`  dang nhap: ${account.email} (${account.role})`);
}

async function ensureCourses(api, plan) {
  const ids = new Map();
  const created = [];
  for (const course of plan.courses) {
    let courseId;
    try {
      const saved = await api.post('/courses', { code: course.code, name: course.name, credits: course.credits });
      courseId = saved.id;
      created.push({ id: courseId, code: course.code });
      log(`  + mon moi ${course.code} (${course.credits} TC)`);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 409) throw error;
      const existing = await api.get(`/courses/by-code/${encodeURIComponent(course.code)}`);
      courseId = existing.id;
      log(`  = mon da co ${course.code}`);
    }
    ids.set(normalize(course.code), courseId);

    if (course.opened_semesters != null) {
      await api.put(`/courses/${courseId}/opened-semesters`, { semester_codes: course.opened_semesters });
      log(`    hoc ky mo: ${course.opened_semesters.join(', ') || '(rong)'}`);
    }
  }
  return { ids, created };
}

async function ensureCurriculum(api, curriculum) {
  try {
    const saved = await api.post('/curricula', curriculum);
    log(`  + chuong trinh moi ${saved.code} (${saved.id})`);
    return { curriculum: saved, created: true };
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 409) throw error;
    const page = await api.get(`/curricula?search=${encodeURIComponent(curriculum.code)}&take=100`);
    const found = (page ?? []).find((item) => normalize(item.code) === normalize(curriculum.code));
    assert(found, `Ma chuong trinh "${curriculum.code}" da ton tai nhung khong tim thay khi tra cuu`);
    log(`  = chuong trinh da co ${found.code} (${found.id})`);
    return { curriculum: found, created: false };
  }
}

async function upsertCurriculumCourses(api, curriculumId, plan, courseIds) {
  for (const item of plan.curriculum_courses) {
    const courseId = courseIds.get(normalize(item.course_code));
    const year = item.recommended_year ?? null;
    const term = item.recommended_term ?? null;
    await api.post(`/curricula/${curriculumId}/courses`, {
      course_id: courseId,
      recommended_year: year,
      recommended_term: term,
    });
    log(`  + ${item.course_code}: ${year === null ? 'chua xep ky (pool tu chon)' : `nam ${year}, ky ${term}`}`);
  }
}

async function ensureGroups(api, curriculumId, plan, courseIds) {
  const existing = await api.get(`/curricula/${curriculumId}/groups`);
  const byName = new Map(existing.map((group) => [normalize(group.name), group]));

  for (const group of plan.groups) {
    const scope = group.pool_scope ?? 'listed';
    const courseIdsOfGroup = (group.course_codes ?? []).map((code) => courseIds.get(normalize(code)));
    const payload = {
      name: group.name,
      kind: group.kind,
      required_count: group.required_count ?? null,
      required_credits: group.required_credits ?? null,
      pool_scope: scope,
      pool_course_credits: group.pool_course_credits ?? null,
    };
    const target = group.required_credits != null
      ? `${group.required_credits} TC`
      : `${group.required_count} mon`;

    const current = byName.get(normalize(group.name));
    if (current) {
      await api.patch(`/curricula/${curriculumId}/groups/${current.id}`, payload);
      const updated = scope === 'any'
        ? null
        : await api.put(`/curricula/${curriculumId}/groups/${current.id}/members`, { course_ids: courseIdsOfGroup });
      const members = updated ? `${updated.members.length} mon` : 'khong co thanh vien (khoi any)';
      log(`  = nhom da co "${group.name}": ${members}, can ${target}`);
      continue;
    }

    const saved = await api.post(`/curricula/${curriculumId}/groups`, {
      ...payload,
      ...(scope === 'listed' ? { course_ids: courseIdsOfGroup } : {}),
    });
    const members = scope === 'any' ? 'khong co thanh vien (khoi any)' : `${saved.members.length} mon`;
    log(`  + nhom "${group.name}" (${group.kind}, ${scope}): ${members}, can ${target}`);
  }
}

async function ensureSpecializations(api, curriculumId, plan, courseIds) {
  const existing = await api.get(`/curricula/${curriculumId}/specializations`);
  const byCode = new Map(existing.map((specialization) => [normalize(specialization.code), specialization]));
  const groups = await api.get(`/curricula/${curriculumId}/groups`);
  const rootByName = new Map(
    groups.filter((group) => group.specialization_id === null).map((group) => [normalize(group.name), group]),
  );

  for (const specialization of plan.specializations) {
    const payload = {
      code: specialization.code,
      name: specialization.name,
      description: specialization.description ?? null,
    };
    let current = byCode.get(normalize(specialization.code));
    if (current) {
      current = await api.patch(`/curricula/${curriculumId}/specializations/${current.id}`, payload);
      log(`  = chuyen nganh da co ${current.code} - ${current.name}`);
    } else {
      current = await api.post(`/curricula/${curriculumId}/specializations`, payload);
      log(`  + chuyen nganh ${current.code} - ${current.name}`);
    }

    const childByName = new Map(current.groups.map((group) => [normalize(group.name), group]));
    // Khoi con anh em khong duoc trung mon: bo truoc cac mon se roi khoi moi khoi con da co,
    // de mon chuyen tu khoi nay sang khoi kia khong bi backend chan khi PATCH.
    for (const group of specialization.groups) {
      const child = childByName.get(normalize(group.name));
      if (!child) continue;
      const target = new Set(group.course_codes.map((code) => courseIds.get(normalize(code))));
      const keep = child.members.map((member) => member.course_id).filter((id) => target.has(id));
      if (keep.length !== child.members.length) {
        await api.put(`/curricula/${curriculumId}/groups/${child.id}/members`, { course_ids: keep });
      }
    }
    for (const group of specialization.groups) {
      const parent = rootByName.get(normalize(group.parent_group));
      assert(parent, `Khong tim thay khoi goc "${group.parent_group}" sau khi tao nhom mon`);
      const ids = group.course_codes.map((code) => courseIds.get(normalize(code)));
      // Bo trong CA HAI yeu cau -> ke thua khoi goc (chi thu hep danh sach mon), giong backend.
      const inherit = group.required_count == null && group.required_credits == null;
      const fields = {
        name: group.name,
        kind: group.kind ?? parent.kind,
        required_count: inherit ? parent.required_count : group.required_count ?? null,
        required_credits: inherit ? parent.required_credits : group.required_credits ?? null,
        course_ids: ids,
      };
      let child = childByName.get(normalize(group.name));
      if (child && child.parent_group_id !== parent.id) {
        // Khoi goc cua khoi chuyen nganh khong doi duoc sau khi tao: xoa roi tao lai.
        await api.delete(`/curricula/${curriculumId}/groups/${child.id}`);
        child = undefined;
      }
      const saved = child
        ? await api.patch(`/curricula/${curriculumId}/groups/${child.id}`, fields)
        : await api.post(`/curricula/${curriculumId}/groups`, {
          ...fields, specialization_id: current.id, parent_group_id: parent.id,
        });
      log(`    ${child ? '=' : '+'} "${saved.name}": ${saved.members.length}/${parent.members.length} mon cua "${parent.name}"`);
    }
  }
}

async function ensureCategories(api, curriculumId, plan, courseIds) {
  const existing = await api.get(`/curricula/${curriculumId}/categories`);
  const byName = new Map(existing.map((category) => [normalize(category.name), category]));

  for (const category of plan.categories) {
    const ids = category.course_codes.map((code) => courseIds.get(normalize(code)));
    const current = byName.get(normalize(category.name));
    if (current) {
      const updated = await api.patch(`/curricula/${curriculumId}/categories/${current.id}`, {
        name: category.name,
        course_ids: ids,
      });
      log(`  = nhom hoc phan da co "${category.name}": ${updated.members.length} mon`);
      continue;
    }
    const saved = await api.post(`/curricula/${curriculumId}/categories`, { name: category.name, course_ids: ids });
    log(`  + nhom hoc phan "${category.name}": ${saved.members.length} mon`);
  }
}

async function setRelations(api, curriculumId, plan, courseIds) {
  for (const item of plan.relations) {
    const courseId = courseIds.get(normalize(item.course_code));
    const payload = {};
    for (const [codesField, idsField] of RELATION_FIELDS) {
      if (item[codesField] != null) {
        payload[idsField] = item[codesField].map((code) => courseIds.get(normalize(code)));
      }
    }
    const rows = await api.put(`/curricula/${curriculumId}/courses/${courseId}/relations`, payload);
    const summary = rows.map((row) => `${row.type}: ${row.course_code} <- ${row.related_course_code}`).join(', ');
    log(`  + ${item.course_code}: ${summary || '(khong con quan he)'}`);
  }
}

async function ensureRegulations(api, curriculumId, plan) {
  const existing = await api.get(`/curricula/${curriculumId}/regulations`);
  const byName = new Map(existing.map((regulation) => [normalize(regulation.name), regulation]));

  for (const regulation of plan.regulations) {
    const current = byName.get(normalize(regulation.name));
    if (current) {
      const updated = await api.patch(`/curricula/${curriculumId}/regulations/${current.id}`, {
        name: regulation.name,
        detail: regulation.detail ?? null,
      });
      log(`  = quy dinh da co "${updated.name}"`);
      continue;
    }
    const saved = await api.post(`/curricula/${curriculumId}/regulations`, {
      name: regulation.name,
      detail: regulation.detail ?? null,
    });
    log(`  + quy dinh "${saved.name}"`);
  }
}

/** Xoa du lieu co trong DB nhung khong con trong file (--prune). */
async function prune(api, curriculumId, plan) {
  const keep = (items, key = 'name') => new Set(items.map((item) => normalize(item[key])));
  const specCodes = keep(plan.specializations, 'code');
  const specializations = await api.get(`/curricula/${curriculumId}/specializations`);
  for (const specialization of specializations) {
    if (!specCodes.has(normalize(specialization.code))) {
      await api.delete(`/curricula/${curriculumId}/specializations/${specialization.id}`);
      log(`  - chuyen nganh ${specialization.code}`);
    }
  }

  const groupNames = keep([...plan.groups, ...plan.specializations.flatMap((specialization) => specialization.groups)]);
  const groups = await api.get(`/curricula/${curriculumId}/groups`);
  // Khoi chuyen nganh dung sau trong danh sach: xoa truoc; xoa khoi goc cung tu xoa khoi con cua no.
  for (const group of [...groups].reverse()) {
    if (!groupNames.has(normalize(group.name))) {
      await api.delete(`/curricula/${curriculumId}/groups/${group.id}`).catch((error) => {
        if (!(error instanceof ApiError) || error.status !== 404) throw error;
      });
      log(`  - nhom mon "${group.name}"`);
    }
  }

  const categoryNames = keep(plan.categories);
  for (const category of await api.get(`/curricula/${curriculumId}/categories`)) {
    if (!categoryNames.has(normalize(category.name))) {
      await api.delete(`/curricula/${curriculumId}/categories/${category.id}`);
      log(`  - nhom hoc phan "${category.name}"`);
    }
  }

  const regulationNames = keep(plan.regulations);
  for (const regulation of await api.get(`/curricula/${curriculumId}/regulations`)) {
    if (!regulationNames.has(normalize(regulation.name))) {
      await api.delete(`/curricula/${curriculumId}/regulations/${regulation.id}`);
      log(`  - quy dinh "${regulation.name}"`);
    }
  }
}

/** Doc lai tu API va doi chieu voi du lieu dau vao - day la buoc "nghiem thu" chuong trinh. */
async function verify(api, curriculumId, plan, courseIds) {
  const errors = [];
  const curriculum = await api.get(`/curricula/${curriculumId}`);
  if (normalize(curriculum.code) !== normalize(plan.curriculum.code)) errors.push('ma chuong trinh khong khop');

  const assigned = await api.get(`/curricula/${curriculumId}/courses`);
  const assignedIds = new Set(assigned.map((item) => item.course_id));
  if (assigned.length !== plan.curriculum_courses.length) {
    errors.push(`so mon trong chuong trinh = ${assigned.length}, du kien ${plan.curriculum_courses.length}`);
  }
  for (const item of plan.curriculum_courses) {
    if (!assignedIds.has(courseIds.get(normalize(item.course_code)))) {
      errors.push(`mon ${item.course_code} chua vao chuong trinh`);
    }
  }

  const groups = await api.get(`/curricula/${curriculumId}/groups`);
  let anyBlocks = 0;
  for (const group of groups) {
    if (group.pool_scope === 'any') {
      anyBlocks += 1;
      if (group.members.length) errors.push(`nhom "${group.name}": khoi any khong duoc co thanh vien`);
      if (!group.required_credits) errors.push(`nhom "${group.name}": khoi any thieu required_credits`);
      continue;
    }
    for (const member of group.members) {
      if (!assignedIds.has(member.course_id)) {
        errors.push(`nhom "${group.name}": mon ${member.course?.code} khong thuoc chuong trinh`);
      }
    }
    if (group.required_count != null && group.members.length < group.required_count) {
      errors.push(`nhom "${group.name}": chi co ${group.members.length} mon nhung can ${group.required_count}`);
    }
  }

  const specializations = await api.get(`/curricula/${curriculumId}/specializations`);
  const specializationByCode = new Map(specializations.map((item) => [normalize(item.code), item]));
  for (const expected of plan.specializations) {
    const actual = specializationByCode.get(normalize(expected.code));
    if (!actual) {
      errors.push(`chuyen nganh "${expected.code}" chua duoc tao`);
      continue;
    }
    for (const group of expected.groups) {
      const child = actual.groups.find((item) => normalize(item.name) === normalize(group.name));
      if (!child) errors.push(`chuyen nganh ${expected.code}: thieu khoi "${group.name}"`);
      else if (child.members.length !== group.course_codes.length) {
        errors.push(`khoi "${group.name}": ${child.members.length} mon, du kien ${group.course_codes.length}`);
      }
    }
  }

  const categories = await api.get(`/curricula/${curriculumId}/categories`);
  const categoryByName = new Map(categories.map((category) => [normalize(category.name), category]));
  for (const expected of plan.categories) {
    const actual = categoryByName.get(normalize(expected.name));
    if (!actual) {
      errors.push(`nhom hoc phan "${expected.name}" chua duoc tao`);
    } else if (actual.members.length !== expected.course_codes.length) {
      errors.push(`nhom hoc phan "${expected.name}": ${actual.members.length} mon, du kien ${expected.course_codes.length}`);
    }
  }

  const relations = await api.get(`/curricula/${curriculumId}/relations`);
  for (const row of relations) {
    if (!assignedIds.has(row.course_id) || !assignedIds.has(row.related_course_id)) {
      errors.push(`quan he ${row.type} ${row.course_code} -> ${row.related_course_code} co dau mut ngoai chuong trinh`);
    }
  }

  const regulations = await api.get(`/curricula/${curriculumId}/regulations`);

  if (errors.length) fail(`Nghiem thu that bai:\n  - ${errors.join('\n  - ')}`);

  log(`  chuong trinh : ${curriculum.code} - ${curriculum.name} (${curriculum.cohort}, ${curriculum.duration_years} nam)`);
  log(`  mon hoc      : ${assigned.length}`);
  const rootGroups = groups.filter((group) => group.specialization_id === null);
  log(`  nhom mon     : ${rootGroups.length} khoi goc (${anyBlocks} khoi "any") + ${groups.length - rootGroups.length} khoi chuyen nganh`);
  log(`  chuyen nganh : ${specializations.length}`);
  log(`  nhom hoc phan: ${categories.length}`);
  log(`  quan he      : ${relations.length}`);
  log(`  quy dinh     : ${regulations.length}`);
  return { curriculum, assigned, groups, relations, regulations };
}

/* ----------------------------------- main ---------------------------------- */

async function main() {
  log(`BK Uni - tao chuong trinh dao tao qua API`);
  log(`  API    : ${config.baseUrl}`);
  log(`  Origin : ${config.origin}`);
  log(`  Du lieu: ${config.dataFile}`);

  const plan = JSON.parse(await readFile(config.dataFile, 'utf8'));
  const summary = validatePlan(plan);
  log(`\nDu lieu hop le: ${plan.courses.length} mon, ${plan.curriculum_courses.length} mon trong chuong trinh, ` +
    `${summary.groupCount} nhom mon, ${summary.specializationCount} chuyen nganh (${summary.specializationGroupCount} khoi), ${summary.categoryCount} nhom hoc phan, ${(plan.relations ?? []).length} quan he, ${summary.regulationCount} quy dinh.`);

  if (config.dryRun) {
    log('\n--dry-run: khong ghi du lieu. Bo co nay de tao that.');
    return;
  }

  const api = new Api(config);

  heading('Dang nhap ADMIN');
  await login(api);

  heading('Mon hoc (danh muc dung chung)');
  const { ids: courseIds, created: createdCourses } = await ensureCourses(api, plan);

  heading('Chuong trinh dao tao');
  const { curriculum } = await ensureCurriculum(api, { ...plan.curriculum, description: plan.curriculum.description ?? null });

  heading('Mon trong chuong trinh');
  await upsertCurriculumCourses(api, curriculum.id, plan, courseIds);

  heading('Nhom mon');
  await ensureGroups(api, curriculum.id, plan, courseIds);

  heading('Chuyen nganh (khong bat buoc)');
  await ensureSpecializations(api, curriculum.id, plan, courseIds);

  heading('Nhom hoc phan (the)');
  await ensureCategories(api, curriculum.id, plan, courseIds);

  heading('Quan he tien quyet / khuyen nghi');
  await setRelations(api, curriculum.id, plan, courseIds);

  heading('Quy dinh dao tao');
  await ensureRegulations(api, curriculum.id, plan);

  if (config.prune) {
    heading('Don du lieu khong con trong file (--prune)');
    await prune(api, curriculum.id, plan);
  }

  heading('Nghiem thu');
  await verify(api, curriculum.id, plan, courseIds);

  log(`\nXong. Chuong trinh: ${config.baseUrl}/curricula/${curriculum.id}`);
  log(`Xem tren web: ${config.origin.replace(/\/$/, '')}/admin/curricula/${curriculum.id}`);
  log(`Swagger: ${config.baseUrl.replace(/\/api$/, '')}/docs`);

  if (config.removeAfter) {
    heading('Don dep (--remove-after)');
    await api.delete(`/curricula/${curriculum.id}`);
    log(`  - da xoa chuong trinh ${curriculum.code}`);
    for (const course of createdCourses) {
      await api.delete(`/courses/${course.id}`);
      log(`  - da xoa mon ${course.code}`);
    }
    log('  chi xoa mon do lan chay nay tao ra; mon co san duoc giu nguyen.');
  }
}

main().catch((error) => {
  if (error instanceof ApiError) {
    const hint = error.status === 403 ? ' (kiem tra header Origin va vai tro ADMIN)'
      : error.status === 429 ? ' (vuot gioi han 120 request/phut - doi 1 phut roi chay lai)'
        : '';
    fail(`${error.message}${hint}`);
  }
  fail(error instanceof Error ? error.stack ?? error.message : String(error));
});
