import 'dotenv/config';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { DataSource } from 'typeorm';
import {
  Curriculum,
  CURRICULUM_PROFILE_FIELDS,
  CurriculumProfile,
  CurriculumProfileField,
  CurriculumProfileText,
} from '../curriculum/entities/curriculum.entity';
import { getDatabaseOptions } from './database-options';
import { entities } from './entities';

/**
 * Đổ phần giới thiệu chương trình từ API myBK `v2/curriculums` vào các CTĐT đã có (source_system = 'mybk'),
 * khớp theo `source_id`. Không tạo/xóa CTĐT, không đụng tới môn, khối, kế hoạch (vẫn lấy từ v1 qua builder).
 *
 *   npm run curriculum:sync-profiles                       # tải từ myBK (token khách, 1-2 request)
 *   npm run curriculum:sync-profiles -- --file=cur.json    # dùng file JSON đã tải (data.content = danh sách)
 *   npm run curriculum:sync-profiles -- --dry-run          # chỉ in, không ghi
 *
 * Ghi: name_en, profile (HTML -> văn bản thuần), profile_source_code, source_synced_at.
 * Bản ghi gốc không có phần giới thiệu (CTĐT khóa 2023 kiểu cũ) thì mượn từ CTĐT cùng ngành (mã CTĐT giống nhau trừ
 * khóa) ở khóa gần nhất; `profile_source_code` ghi rõ mã CTĐT myBK đã cho nội dung.
 */

const BASE = 'https://mybk.hcmut.edu.vn';
const UA = 'Mozilla/5.0';

const SOURCE_FIELDS: Record<CurriculumProfileField, string> = {
  overview: 'description',
  career_opportunities: 'jobOpportunity',
  admission_target: 'enrollmentObject',
  training_process: 'trainingProcess',
  assessment_method: 'assessmentMethod',
};

interface MybkCurriculum {
  id: number;
  code: string;
  applyForYear: number;
  nameEn: string | null;
  lastSyncedAt: string | null;
  major: { nameEn: string | null; type: string | null } | null;
  [key: string]: unknown;
}

interface Target {
  row: Curriculum;
  source?: MybkCurriculum;
  nameEn: string | null;
  profile: CurriculumProfile | null;
  profileSourceCode: string | null;
  syncedAt: Date | null;
}

async function main(): Promise<void> {
  const options = new Map(process.argv.slice(2).map(arg => {
    const [key, ...value] = arg.replace(/^--/, '').split('=');
    return [key, value.length ? value.join('=') : 'true'] as const;
  }));
  const dryRun = options.has('dry-run');
  const list = options.has('file') ? readList(resolve(process.cwd(), options.get('file')!)) : await fetchList();
  const byId = new Map(list.map(item => [item.id, item]));
  console.log(`myBK v2/curriculums: ${list.length} CTĐT`);

  const dataSource = new DataSource({
    ...getDatabaseOptions(process.env as Record<string, unknown>),
    entities,
    synchronize: false,
    migrations: [],
  });
  await dataSource.initialize();
  try {
    const repository = dataSource.getRepository(Curriculum);
    const rows = await repository.find({ where: { source_system: 'mybk' }, order: { code: 'ASC' } });
    const targets: Target[] = rows.map(row => {
      const source = row.source_id == null ? undefined : byId.get(row.source_id);
      const profile = source ? toProfile(source) : null;
      return {
        row,
        source,
        nameEn: englishName(row, source),
        profile,
        profileSourceCode: profile ? source!.code : null,
        syncedAt: parseMybkTime(source?.lastSyncedAt),
      };
    });

    // Mượn phần giới thiệu từ khóa gần nhất cùng ngành (vd CS-2023-KHMT <- CS-2024-KHMT); biến thể có hậu tố
    // (vd MSE-2023-KTVL-VKH) không có bản cùng hậu tố thì mượn của ngành gốc (MSE-*-KTVL).
    const family = (code: string) => code.replace(/-\d{4}(?=-|$)/, '');
    const major = (code: string) => code.split('-').filter(part => !/^\d{4}$/.test(part)).slice(0, 2).join('-');
    const owners = targets.filter(item => item.profile && item.profileSourceCode === item.source?.code);
    for (const target of targets.filter(item => item.source && !item.profile)) {
      const nearest = (list: Target[]) => list.sort((a, b) =>
        Math.abs(a.row.cohort - target.row.cohort) - Math.abs(b.row.cohort - target.row.cohort) || b.row.cohort - a.row.cohort)[0];
      const donor = nearest(owners.filter(item => family(item.row.code) === family(target.row.code)))
        ?? nearest(owners.filter(item => family(item.row.code) === major(target.row.code)));
      if (donor) {
        target.profile = donor.profile;
        target.profileSourceCode = donor.profileSourceCode;
      }
    }

    let own = 0, borrowed = 0, empty = 0, missing = 0, changed = 0;
    for (const target of targets) {
      const { row } = target;
      if (!target.source) {
        missing++;
        console.log(`  ! ${row.code}: không thấy source_id ${row.source_id} trên myBK v2`);
        continue;
      }
      if (!target.profile) empty++;
      else if (target.profileSourceCode === target.source.code) own++;
      else {
        borrowed++;
        console.log(`  ~ ${row.code}: mượn giới thiệu từ ${target.profileSourceCode}`);
      }
      if (dryRun) continue;
      const result = await repository.update(row.id, {
        name_en: target.nameEn,
        profile: target.profile as never,
        profile_source_code: target.profileSourceCode,
        source_synced_at: target.syncedAt,
      });
      changed += result.affected ?? 0;
    }
    console.log(
      `${rows.length} CTĐT mybk: giới thiệu riêng ${own}, mượn khóa khác ${borrowed}, không có ${empty}, ` +
      `không thấy trên myBK ${missing}${dryRun ? ' (dry-run, không ghi)' : `; đã cập nhật ${changed}`}`,
    );
    if (dryRun && targets[0]?.profile) {
      const sample = targets.find(item => item.profile)!;
      console.log(`\nVí dụ ${sample.row.code}:\n${JSON.stringify(sample.profile, null, 1).slice(0, 1500)}`);
    }
  } finally {
    await dataSource.destroy();
  }
}

function readList(file: string): MybkCurriculum[] {
  const json = JSON.parse(readFileSync(file, 'utf8').trimStart()) as { data?: { content?: MybkCurriculum[] } };
  const content = json.data?.content;
  if (!Array.isArray(content)) throw new Error(`${file}: không có data.content`);
  return content;
}

async function fetchList(): Promise<MybkCurriculum[]> {
  const token = /id="hid_Token"\s+value="([^"]+)"/.exec(await fetchPageWithCookies(`${BASE}/app/public/de-cuong-mon-hoc`))?.[1];
  if (!token) throw new Error('Không lấy được hid_Token từ trang đề cương myBK');
  const items: MybkCurriculum[] = [];
  for (let index = 0; ; index++) {
    const response = await fetch(`${BASE}/api/v2/curriculums?page=${index}&size=2000`, {
      headers: { 'user-agent': UA, authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`v2/curriculums: HTTP ${response.status}`);
    const json = await response.json() as { code: string; msg: string; data: { content: MybkCurriculum[]; last: boolean } };
    if (json.code !== '200') throw new Error(`v2/curriculums: ${json.code} ${json.msg}`);
    items.push(...json.data.content);
    if (json.data.last || !json.data.content.length) return items;
    await new Promise(done => setTimeout(done, 800));
  }
}

/** Trang myBK cấp cookie SESSION rồi redirect về chính nó; fetch mặc định không giữ cookie nên tự theo redirect. */
async function fetchPageWithCookies(url: string): Promise<string> {
  const cookies = new Map<string, string>();
  for (let hop = 0; hop < 10; hop++) {
    const response = await fetch(url, {
      redirect: 'manual',
      headers: { 'user-agent': UA, cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join('; ') },
    });
    for (const header of response.headers.getSetCookie()) {
      const [pair] = header.split(';');
      const index = pair.indexOf('=');
      if (index > 0) cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
    }
    const location = response.headers.get('location');
    if (response.status < 300 || response.status >= 400 || !location) return response.text();
    url = new URL(location, url).toString();
  }
  throw new Error(`Quá nhiều lần redirect khi mở ${url}`);
}

function toProfile(source: MybkCurriculum): CurriculumProfile | null {
  const profile: CurriculumProfile = {};
  for (const [lang, suffix] of [['vi', 'Vi'], ['en', 'En']] as const) {
    const text: CurriculumProfileText = {};
    for (const field of CURRICULUM_PROFILE_FIELDS) {
      const value = htmlToText(source[`${SOURCE_FIELDS[field]}${suffix}`]);
      if (value) text[field] = value;
    }
    if (Object.keys(text).length) profile[lang] = text;
  }
  return Object.keys(profile).length ? profile : null;
}

/** Tên tiếng Anh của ngành; bản ghi kiểu cũ gắn "nhóm ngành" (KN) nên lấy phần tiếng Anh trong tên CTĐT. */
function englishName(row: Curriculum, source: MybkCurriculum | undefined): string | null {
  if (source?.major?.type !== 'KN' && source?.major?.nameEn?.trim()) return source.major.nameEn.trim();
  const fromName = /\(([^()]+)\)\s*-\s*khóa \d{4}$/.exec(row.name)?.[1];
  return fromName?.trim() || source?.nameEn?.trim() || null;
}

/** myBK trả giờ Việt Nam không kèm múi giờ, vd `2026-11-19T15:46:05`. */
function parseMybkTime(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}+07:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', bull: '•', middot: '·' };

/** HTML soạn trên myBK -> văn bản thuần: đoạn cách bằng dòng trống, mục danh sách bắt đầu bằng "- ". */
export function htmlToText(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const text = value
    .replace(/\r/g, '')
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|ul|ol|h[1-6]|tr|table)>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(+code))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name: string) => ENTITIES[name.toLowerCase()] ?? match)
    .split('\n')
    .map(line => line.replace(/[^\S\n]+/g, ' ').trim().replace(/^[·•▪●◦-]\s*/, '- '))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text || null;
}

if (require.main === module) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
