// 4.6 Phía Elasticsearch của so sánh full-text (đối chiếu với results/47-fts-postgres.txt).
// Chạy trong thư mục Backend:
//   npx ts-node -T db-lab/es-bench.ts > db-lab/results/47-fts-es.txt
import 'dotenv/config';
import { DataSource } from 'typeorm';
import { getDatabaseOptions } from '../src/database/database-options';
import { entities } from '../src/database/entities';
import { CourseOutline } from '../src/outline/entities/course-outline.entity';
import { ElasticsearchClient } from '../src/outline/search/elasticsearch.client';
import { OutlineSearchService } from '../src/outline/search/outline-search.service';

const QUERIES = ['docker', 'csdl', 'tri tue nhan tao', 'kiem thu phan mem', 'kubernetess', 'máy học', 'xử lý ảnh'];
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const es = new ElasticsearchClient();
  const dataSource = new DataSource({ ...getDatabaseOptions(process.env as Record<string, unknown>), entities, synchronize: false, migrations: [] });
  await dataSource.initialize();
  const search = new OutlineSearchService(dataSource.getRepository(CourseOutline), es);
  try {
    const stats = await es.request<{ _all: { primaries: { store: { size_in_bytes: number }; docs: { count: number }; segments: { count: number } } } }>(
      'GET', `/${es.index}/_stats/store,docs,segments`,
    );
    const p = stats._all.primaries;
    console.log(`[A] index ${es.index}: ${p.docs.count} tài liệu, ${(p.store.size_in_bytes / 1024 / 1024).toFixed(1)} MB, ${p.segments.count} segment`);

    console.log('\n[C] Số kết quả và top 3 (cùng truy vấn với PostgreSQL)');
    for (const query of QUERIES) {
      const result = await search.search(query, { codes: null, limit: 3 });
      console.log(`  ${query.padEnd(18)} | ${String(result.total).padStart(4)} | ${result.mode.padEnd(9)} | ${result.results.map(hit => `${hit.code} ${hit.name}`).join(' | ')}`);
    }

    console.log('\n[D] Thời gian phía server (`took`, trung vị 9 lần, đã gồm highlight + 4 aggregation)');
    for (const query of QUERIES) {
      await search.search(query, { codes: null, limit: 5 });
      const took: number[] = [];
      for (let i = 0; i < 9; i++) took.push((await search.search(query, { codes: null, limit: 5 })).took_ms);
      console.log(`  ES | ${query.padEnd(18)} | trung vị ${median(took)} ms (min ${Math.min(...took)}, max ${Math.max(...took)})`);
    }
    const similar: number[] = [];
    for (let i = 0; i < 9; i++) similar.push((await search.similar('CO3001', { codes: null, limit: 5 }))!.took_ms);
    console.log(`  ES | more_like_this CO3001 | trung vị ${median(similar)} ms`);

    console.log('\n[F] Tính nhất quán: ES là near real-time (tài liệu chỉ tìm thấy được sau refresh, mặc định mỗi 1 giây)');
    const probe = 'ZZPROBE';
    const doc = { code: probe, version: '1', applies_from: null, credits: 0, name_vi: 'tukhoamoi', name_en: null, faculty: null,
      department: null, course_type: null, objectives: null, summary: null, learning_outcomes: [], sessions: [], assessment: null,
      study_guide: null, references: null, final_exam_format: null, midterm_format: null, has_lab: false, has_project: false,
      total_study_hours: null, indexed_at: new Date().toISOString() };
    const count = async () => (await es.request<{ count: number }>('POST', `/${es.index}/_count`, { query: { match: { name_vi: 'tukhoamoi' } } })).count;
    const started = Date.now();
    await es.request('PUT', `/${es.index}/_doc/${probe}`, doc);
    console.log(`  ngay sau khi ghi (${Date.now() - started} ms): tìm thấy ${await count()} tài liệu`);
    let seenAfter = -1;
    for (let i = 0; i < 40; i++) {
      if (await count() > 0) { seenAfter = Date.now() - started; break; }
      await sleep(100);
    }
    console.log(`  tìm thấy sau khoảng ${seenAfter} ms (khi refresh định kỳ chạy)`);
    const realtime = await es.request<{ found: boolean }>('GET', `/${es.index}/_doc/${probe}`);
    console.log(`  GET theo _id thì luôn thấy ngay (real-time get): found = ${realtime.found}`);
    await es.request('DELETE', `/${es.index}/_doc/${probe}?refresh=true`);
  } finally {
    await dataSource.destroy();
  }
}

main().catch(error => { console.error(error); process.exit(1); });
