import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { currentSemester } from '../../advisor/semester';
import { CourseOutline } from '../entities/course-outline.entity';
import { compareVersions, pickOutlineForSemester } from '../outline-format';
import { ElasticsearchClient, ElasticsearchError } from './elasticsearch.client';
import {
  OUTLINE_INDEX_MAPPINGS,
  OUTLINE_INDEX_SETTINGS,
  type OutlineRow,
  type OutlineSearchDocument,
  SEARCH_FIELDS,
  SIMILARITY_FIELDS,
  toSearchDocument,
} from './outline-search.mapping';

const BULK_CHUNK = 250;
const CONTENT_CHUNK = 200;

/** Tên tiếng Việt của trường, để kết quả trả cho AI/giao diện dễ đọc. */
const FIELD_LABEL: Record<string, string> = {
  name_vi: 'tên môn', name_en: 'tên tiếng Anh', objectives: 'mục tiêu', summary: 'tóm tắt',
  learning_outcomes: 'chuẩn đầu ra', sessions: 'nội dung buổi học', assessment: 'đánh giá',
  study_guide: 'hướng dẫn học', references: 'tài liệu',
};
const HIGHLIGHT_FIELDS = ['name_vi', 'objectives', 'summary', 'learning_outcomes', 'sessions', 'assessment', 'references'];

export interface OutlineSearchFilters {
  has_lab?: boolean;
  has_project?: boolean;
  final_exam_format?: string;
}

export interface OutlineSearchHit {
  code: string;
  name: string | null;
  credits: number | null;
  score: number;
  matched_by: string[];
  highlights: string[];
  faculty: string | null;
  final_exam_format: string | null;
  has_lab: boolean;
  has_project: boolean;
  total_study_hours: number | null;
}

export interface OutlineSearchResult {
  engine: 'elasticsearch';
  took_ms: number;
  total: number;
  max_score: number | null;
  results: OutlineSearchHit[];
  facets: Record<string, { value: string; count: number }[]>;
}

interface EsHit {
  _id: string;
  _score: number | null;
  _source: Partial<OutlineSearchDocument>;
  highlight?: Record<string, string[]>;
  matched_queries?: string[];
}
interface EsSearchResponse {
  took: number;
  hits: { total: { value: number }; max_score: number | null; hits: EsHit[] };
  aggregations?: Record<string, { buckets: { key: string | number; key_as_string?: string; doc_count: number }[] }>;
}

const round = (value: number | null) => (value === null ? 0 : Math.round(value * 100) / 100);

/**
 * Tìm kiếm toàn văn trên đề cương bằng Elasticsearch, và đồng bộ index từ PostgreSQL.
 *
 * PostgreSQL vẫn là nguồn dữ liệu gốc; index ES chỉ là bản sao để tìm kiếm, có thể dựng lại bất cứ lúc nào
 * (`npm run search:reindex`). Reindex toàn bộ ghi vào một index mới rồi đổi alias một cách nguyên tử, nên
 * không có lúc nào người dùng tìm trên index trống/dở dang.
 */
@Injectable()
export class OutlineSearchService {
  private readonly logger = new Logger(OutlineSearchService.name);

  constructor(
    @InjectRepository(CourseOutline) private readonly outlines: Repository<CourseOutline>,
    private readonly es: ElasticsearchClient,
  ) {}

  get enabled(): boolean {
    return this.es.enabled;
  }

  get alias(): string {
    return this.es.index;
  }

  /* --------------------------------- Đồng bộ -------------------------------- */

  /** Dựng lại toàn bộ index từ CSDL: index mới -> bulk -> refresh -> đổi alias -> xóa index cũ. */
  async reindexAll(semester = currentSemester()) {
    const started = Date.now();
    const documents = await this.loadDocuments(null, semester);
    const index = `${this.alias}-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
    await this.es.request('PUT', `/${index}`, { settings: OUTLINE_INDEX_SETTINGS, mappings: OUTLINE_INDEX_MAPPINGS });
    try {
      await this.bulk(index, documents);
      await this.es.request('POST', `/${index}/_refresh`);
    } catch (error) {
      await this.es.request('DELETE', `/${index}`, undefined, { allow404: true });
      throw error;
    }
    const current = await this.es.request<Record<string, unknown>>('GET', `/_alias/${this.alias}`, undefined, { allow404: true });
    const previous = Object.keys(current).filter(name => name !== 'error' && name !== 'status');
    await this.es.request('POST', '/_aliases', {
      actions: [
        ...previous.map(name => ({ remove: { index: name, alias: this.alias } })),
        { add: { index, alias: this.alias } },
      ],
    });
    for (const name of previous) await this.es.request('DELETE', `/${name}`, undefined, { allow404: true });
    const stats = await this.es.request<{ _all: { primaries: { store: { size_in_bytes: number } } } }>('GET', `/${index}/_stats/store`);
    return {
      alias: this.alias,
      index,
      semester,
      documents: documents.length,
      size_bytes: stats._all.primaries.store.size_in_bytes,
      replaced: previous,
      took_ms: Date.now() - started,
    };
  }

  /**
   * Cập nhật index cho vài môn (gọi sau khi nhập đề cương đã COMMIT). Không có index thì bỏ qua: lần
   * `search:reindex` tiếp theo sẽ dựng đủ. Trả về số tài liệu đã ghi.
   */
  async indexCourses(codes: string[], semester = currentSemester()): Promise<number> {
    if (!this.enabled || !codes.length) return 0;
    const exists = await this.es.request<{ ok: boolean }>('HEAD', `/${this.alias}`);
    if (!exists.ok) return 0;
    const documents = await this.loadDocuments([...new Set(codes.map(code => code.toUpperCase()))], semester);
    await this.bulk(this.alias, documents, true);
    return documents.length;
  }

  async status() {
    if (!this.enabled) return { enabled: false, alias: this.alias };
    try {
      const [health, count, aliases] = await Promise.all([
        this.es.request<{ status: string; cluster_name: string }>('GET', '/_cluster/health'),
        this.es.request<{ count: number }>('GET', `/${this.alias}/_count`, undefined, { allow404: true }),
        this.es.request<Record<string, unknown>>('GET', `/_alias/${this.alias}`, undefined, { allow404: true }),
      ]);
      return {
        enabled: true,
        alias: this.alias,
        cluster: health.cluster_name,
        health: health.status,
        index: Object.keys(aliases).find(name => name !== 'error' && name !== 'status') ?? null,
        documents: count.count ?? 0,
      };
    } catch (error) {
      return { enabled: true, alias: this.alias, error: (error as Error).message };
    }
  }

  /* --------------------------------- Tìm kiếm ------------------------------- */

  /**
   * Tìm đề cương theo chủ đề, hai pha:
   * 1. Chính xác: ghép các truy vấn con có tên (để biết tài liệu khớp vì đâu): mã môn, tiền tố mã, cụm từ liền nhau,
   *    đủ mọi từ (bỏ dấu + từ đồng nghĩa), đúng dấu.
   * 2. Chỉ khi pha 1 không có kết quả: tìm gần đúng (fuzzy, sửa lỗi gõ). Không trộn fuzzy vào pha 1 vì nó kéo theo
   *    nhiễu ("docker" ~ "doctor", "drucker").
   * `codes` giới hạn trong chương trình đào tạo của sinh viên; `null` là tìm toàn trường.
   */
  async search(query: string, options: { codes?: string[] | null; limit?: number; filters?: OutlineSearchFilters } = {}) {
    const exact = await this.runSearch(query, options, false);
    if (exact.total > 0) return { ...exact, mode: 'chính xác' as const };
    const fuzzy = await this.runSearch(query, options, true);
    return {
      ...fuzzy,
      mode: 'gần đúng' as const,
      note: 'Không có kết quả khớp chính xác; đây là kết quả gần đúng (đã thử sửa lỗi gõ), độ liên quan có thể thấp.',
    };
  }

  private async runSearch(query: string, options: { codes?: string[] | null; limit?: number; filters?: OutlineSearchFilters }, fuzzy: boolean) {
    const limit = Math.min(20, Math.max(1, options.limit ?? 8));
    const lowered = query.trim().toLowerCase();
    const exactFields = SEARCH_FIELDS.map(field => field.replace(/^([a-z_]+)/, '$1.exact'));
    const should = fuzzy
      ? [{
        multi_match: {
          query, fields: SEARCH_FIELDS, type: 'best_fields', analyzer: 'vi_folded',
          fuzziness: 'AUTO', prefix_length: 1, operator: 'and', _name: 'gần đúng (sửa lỗi gõ)',
        },
      }]
      : [
        { term: { code: { value: lowered, boost: 100, _name: 'mã môn' } } },
        { prefix: { code: { value: lowered, boost: 30, _name: 'tiền tố mã môn' } } },
        { multi_match: { query, fields: SEARCH_FIELDS, type: 'phrase', slop: 1, boost: 3, _name: 'cụm từ liền nhau' } },
        { multi_match: { query, fields: SEARCH_FIELDS, type: 'best_fields', operator: 'and', boost: 2, _name: 'đủ mọi từ (bỏ dấu, đồng nghĩa)' } },
        { multi_match: { query, fields: exactFields, type: 'best_fields', operator: 'and', boost: 1.5, _name: 'đúng dấu' } },
      ];
    const body = {
      size: limit,
      track_total_hits: true,
      _source: ['code', 'name_vi', 'credits', 'faculty', 'final_exam_format', 'has_lab', 'has_project', 'total_study_hours'],
      query: {
        bool: {
          should,
          minimum_should_match: 1,
          filter: this.filters(options.codes, options.filters),
        },
      },
      highlight: {
        pre_tags: ['**'], post_tags: ['**'], fragment_size: 140, number_of_fragments: 2, order: 'score',
        require_field_match: false,
        fields: Object.fromEntries(HIGHLIGHT_FIELDS.map(field => [field, field === 'name_vi' ? { number_of_fragments: 0 } : {}])),
      },
      aggs: {
        faculty: { terms: { field: 'faculty', size: 5 } },
        final_exam_format: { terms: { field: 'final_exam_format', size: 5 } },
        has_lab: { terms: { field: 'has_lab' } },
        has_project: { terms: { field: 'has_project' } },
      },
    };
    const response = await this.es.request<EsSearchResponse>('POST', `/${this.alias}/_search`, body);
    return this.toResult(response);
  }

  /**
   * Môn có nội dung gần giống một môn cho trước (truy vấn `more_like_this`: lấy các từ có tf-idf cao nhất
   * của tài liệu gốc làm truy vấn). Kèm các từ khóa đặc trưng của môn gốc (term vectors) để giải thích.
   */
  async similar(code: string, options: { codes?: string[] | null; limit?: number } = {}) {
    const id = code.trim().toUpperCase();
    const limit = Math.min(15, Math.max(1, options.limit ?? 6));
    const source = await this.es.request<{ found: boolean; _source?: Partial<OutlineSearchDocument> }>(
      'GET', `/${this.alias}/_doc/${encodeURIComponent(id)}?_source=code,name_vi`, undefined, { allow404: true },
    );
    if (!source.found) return null;
    const [response, keyTerms] = await Promise.all([
      this.es.request<EsSearchResponse>('POST', `/${this.alias}/_search`, {
        size: limit,
        track_total_hits: true,
        _source: ['code', 'name_vi', 'credits', 'faculty', 'final_exam_format', 'has_lab', 'has_project', 'total_study_hours'],
        query: {
          bool: {
            must: {
              more_like_this: {
                fields: SIMILARITY_FIELDS, like: [{ _index: this.alias, _id: id }],
                min_term_freq: 1, min_doc_freq: 2, max_doc_freq: 400, max_query_terms: 40, minimum_should_match: '15%',
              },
            },
            filter: this.filters(options.codes),
          },
        },
        highlight: {
          pre_tags: ['**'], post_tags: ['**'], fragment_size: 120, number_of_fragments: 1, require_field_match: false,
          fields: { objectives: {}, summary: {}, sessions: {}, learning_outcomes: {} },
        },
        aggs: { faculty: { terms: { field: 'faculty', size: 5 } } },
      }),
      this.keyTerms(id),
    ]);
    return { source: { code: id, name: source._source?.name_vi ?? null, key_terms: keyTerms }, ...this.toResult(response) };
  }

  /** Các từ có trọng số tf-idf cao nhất trong nội dung một môn (API _termvectors, tính trên bản giữ dấu). */
  private async keyTerms(id: string): Promise<string[]> {
    try {
      const vectors = await this.es.request<{ term_vectors?: Record<string, { terms: Record<string, { score?: number }> }> }>(
        'POST', `/${this.alias}/_termvectors/${encodeURIComponent(id)}`, {
          fields: ['objectives.exact', 'summary.exact', 'sessions.exact'],
          term_statistics: true, field_statistics: false, positions: false, offsets: false,
          filter: { max_num_terms: 12, min_term_freq: 1, min_doc_freq: 2, max_doc_freq: 300, min_word_length: 3 },
        },
      );
      const scored = new Map<string, number>();
      Object.values(vectors.term_vectors ?? {}).forEach(field => Object.entries(field.terms).forEach(([term, info]) => {
        if (/^\d+$/.test(term)) return;
        scored.set(term, Math.max(scored.get(term) ?? 0, info.score ?? 0));
      }));
      return [...scored.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([term]) => term);
    } catch {
      return [];
    }
  }

  /* --------------------------------- Nội bộ --------------------------------- */

  private filters(codes?: string[] | null, filters: OutlineSearchFilters = {}) {
    const result: Record<string, unknown>[] = [];
    if (codes) result.push({ terms: { code: codes.map(code => code.toLowerCase()) } });
    if (filters.has_lab !== undefined) result.push({ term: { has_lab: filters.has_lab } });
    if (filters.has_project !== undefined) result.push({ term: { has_project: filters.has_project } });
    if (filters.final_exam_format) result.push({ term: { final_exam_format: filters.final_exam_format } });
    return result;
  }

  private toResult(response: EsSearchResponse): OutlineSearchResult {
    const facets = Object.fromEntries(Object.entries(response.aggregations ?? {}).map(([name, agg]) => [
      name,
      agg.buckets.map(bucket => ({ value: bucket.key_as_string ?? String(bucket.key), count: bucket.doc_count })),
    ]));
    return {
      engine: 'elasticsearch',
      took_ms: response.took,
      total: response.hits.total.value,
      max_score: response.hits.max_score === null ? null : round(response.hits.max_score),
      results: response.hits.hits.map(hit => ({
        code: hit._id,
        name: hit._source.name_vi ?? null,
        credits: hit._source.credits ?? null,
        score: round(hit._score),
        matched_by: hit.matched_queries ?? [],
        highlights: Object.entries(hit.highlight ?? {})
          .filter(([field]) => field !== 'name_vi')
          .flatMap(([field, fragments]) => fragments.map(fragment => `${FIELD_LABEL[field] ?? field}: …${fragment.replace(/\s+/g, ' ').trim()}…`))
          .slice(0, 3),
        faculty: hit._source.faculty ?? null,
        final_exam_format: hit._source.final_exam_format ?? null,
        has_lab: hit._source.has_lab ?? false,
        has_project: hit._source.has_project ?? false,
        total_study_hours: hit._source.total_study_hours ?? null,
      })),
      facets,
    };
  }

  private async bulk(index: string, documents: OutlineSearchDocument[], refresh = false): Promise<void> {
    for (let start = 0; start < documents.length; start += BULK_CHUNK) {
      const part = documents.slice(start, start + BULK_CHUNK);
      const body = part.map(doc => `${JSON.stringify({ index: { _index: index, _id: doc.code } })}\n${JSON.stringify(doc)}\n`).join('');
      const last = start + BULK_CHUNK >= documents.length;
      const result = await this.es.request<{ errors: boolean; items: { index: { _id: string; error?: { reason: string } } }[] }>(
        'POST', `/_bulk${refresh && last ? '?refresh=wait_for' : ''}`, body, { ndjson: true, timeoutMs: 60000 },
      );
      if (result.errors) {
        const failed = result.items.filter(item => item.index.error);
        throw new ElasticsearchError(
          `Bulk lỗi ${failed.length} tài liệu, ví dụ ${failed[0].index._id}: ${failed[0].index.error!.reason}`, null,
        );
      }
    }
  }

  /** Mỗi mã môn một tài liệu: bản đề cương áp dụng cho `semester`, nếu chưa có bản nào áp dụng thì lấy bản mới nhất. */
  private async loadDocuments(codes: string[] | null, semester: string): Promise<OutlineSearchDocument[]> {
    const versions = await this.outlines.find({
      where: codes ? { course_code: In(codes) } : {},
      select: { id: true, course_code: true, version: true, applies_from: true },
    });
    const byCode = new Map<string, typeof versions>();
    versions.forEach(item => byCode.set(item.course_code, [...(byCode.get(item.course_code) ?? []), item]));
    const ids = [...byCode.values()].map(list => (
      pickOutlineForSemester(list, semester)
      ?? [...list].sort((a, b) => (a.applies_from ?? '').localeCompare(b.applies_from ?? '') || compareVersions(a.version, b.version)).at(-1)!
    ).id);

    const now = new Date();
    const documents: OutlineSearchDocument[] = [];
    for (let start = 0; start < ids.length; start += CONTENT_CHUNK) {
      const rows = await this.outlines.createQueryBuilder('o')
        .select(['o.course_code', 'o.version', 'o.applies_from', 'o.credits', 'o.name_vi', 'o.name_en'])
        .addSelect('o.content')
        .where('o.id IN (:...ids)', { ids: ids.slice(start, start + CONTENT_CHUNK) })
        .getMany();
      rows.forEach(row => documents.push(toSearchDocument(row as unknown as OutlineRow, now)));
    }
    this.logger.log(`Chuẩn bị ${documents.length} tài liệu đề cương cho Elasticsearch (học kỳ ${semester})`);
    return documents;
  }
}
