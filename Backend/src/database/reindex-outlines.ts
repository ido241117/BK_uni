import 'dotenv/config';
import { DataSource } from 'typeorm';
import { CourseOutline } from '../outline/entities/course-outline.entity';
import { ElasticsearchClient } from '../outline/search/elasticsearch.client';
import { OutlineSearchService } from '../outline/search/outline-search.service';
import { getDatabaseOptions } from './database-options';
import { entities } from './entities';

/**
 * Dựng lại index Elasticsearch của đề cương từ PostgreSQL (không cần chạy server):
 *
 *   npm run search:reindex            # học kỳ hiện tại
 *   npm run search:reindex -- 261     # chọn bản đề cương áp dụng cho học kỳ 261
 *
 * Ghi vào index mới `<alias>-<thời điểm>`, xong mới đổi alias sang và xóa index cũ.
 */
async function main(): Promise<void> {
  const es = new ElasticsearchClient();
  if (!es.enabled) throw new Error('Chưa đặt ELASTICSEARCH_URL trong backend/.env');
  if (!await es.healthy()) throw new Error(`Không kết nối được Elasticsearch tại ${es.url}`);

  const dataSource = new DataSource({
    ...getDatabaseOptions(process.env as Record<string, unknown>),
    entities,
    synchronize: false,
    migrations: [],
  });
  await dataSource.initialize();
  try {
    const search = new OutlineSearchService(dataSource.getRepository(CourseOutline), es);
    const semester = process.argv.slice(2).find(arg => /^\d{3}$/.test(arg));
    const result = await search.reindexAll(semester);
    console.log(
      `Alias ${result.alias} -> ${result.index}: ${result.documents} tài liệu, ` +
      `${(result.size_bytes / 1024 / 1024).toFixed(1)} MB, ${(result.took_ms / 1000).toFixed(1)} s` +
      (result.replaced.length ? ` (đã thay ${result.replaced.join(', ')})` : ''),
    );
  } finally {
    await dataSource.destroy();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
