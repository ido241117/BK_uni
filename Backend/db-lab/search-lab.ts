// Thử OutlineSearchService (đúng code mà tool search_outlines / find_similar_courses gọi) trên index thật.
// Chạy trong thư mục Backend:  npx ts-node -T db-lab/search-lab.ts > db-lab/results/46-search-demo.txt
import 'dotenv/config';
import { DataSource } from 'typeorm';
import { getDatabaseOptions } from '../src/database/database-options';
import { entities } from '../src/database/entities';
import { CourseOutline } from '../src/outline/entities/course-outline.entity';
import { ElasticsearchClient } from '../src/outline/search/elasticsearch.client';
import { OutlineSearchService } from '../src/outline/search/outline-search.service';

const QUERIES: { query: string; note: string; filters?: { has_lab?: boolean; has_project?: boolean; final_exam_format?: string } }[] = [
  { query: 'docker', note: 'công cụ, chỉ xuất hiện trong nội dung từng buổi' },
  { query: 'csdl', note: 'viết tắt -> từ đồng nghĩa "cơ sở dữ liệu"' },
  { query: 'tri tue nhan tao', note: 'gõ không dấu' },
  { query: 'kiem thu phan mem', note: 'không dấu, cụm nhiều từ' },
  { query: 'kubernetess', note: 'gõ sai chính tả' },
  { query: 'máy học', note: 'từ không có trong tên môn (đề cương ghi "học máy")' },
  { query: 'thi tự luận', note: 'tìm theo hình thức đánh giá (văn bản)' },
  { query: 'lập trình', note: 'lọc theo facet hình thức thi', filters: { final_exam_format: 'Vấn đáp' } },
  { query: 'xử lý ảnh', note: 'có lọc: chỉ môn có đồ án', filters: { has_project: true } },
  { query: 'CO30', note: 'tiền tố mã môn' },
];

async function main() {
  const dataSource = new DataSource({ ...getDatabaseOptions(process.env as Record<string, unknown>), entities, synchronize: false, migrations: [] });
  await dataSource.initialize();
  const search = new OutlineSearchService(dataSource.getRepository(CourseOutline), new ElasticsearchClient());
  try {
    for (const item of QUERIES) {
      const result = await search.search(item.query, { codes: null, limit: 4, filters: item.filters });
      console.log(`\n### search_outlines("${item.query}")${item.filters ? ' ' + JSON.stringify(item.filters) : ''} — ${item.note}`);
      console.log(`mode ${result.mode}, took ${result.took_ms} ms, total ${result.total}, max_score ${result.max_score}`);
      console.log(`facets: faculty=${JSON.stringify(result.facets.faculty?.slice(0, 3))} final_exam=${JSON.stringify(result.facets.final_exam_format?.slice(0, 3))}`);
      result.results.forEach(hit => {
        console.log(`  ${hit.code.padEnd(8)} ${String(hit.score).padStart(6)}  ${hit.name}  [${hit.matched_by.join(' | ')}]`);
        hit.highlights.slice(0, 2).forEach(fragment => console.log(`           ${fragment.slice(0, 170)}`));
      });
    }
    for (const code of ['CO3001', 'CO2003', 'CO3117']) {
      const result = await search.similar(code, { codes: null, limit: 5 });
      if (!result) { console.log(`\n### find_similar_courses("${code}") — không có đề cương`); continue; }
      console.log(`\n### find_similar_courses("${code}") — ${result.source.name}`);
      console.log(`key_terms: ${result.source.key_terms.join(', ')}`);
      console.log(`took ${result.took_ms} ms, total ${result.total}`);
      result.results.forEach(hit => console.log(`  ${hit.code.padEnd(8)} ${String(hit.score).padStart(6)}  ${hit.name}`));
    }
  } finally {
    await dataSource.destroy();
  }
}

main().catch(error => { console.error(error); process.exit(1); });
