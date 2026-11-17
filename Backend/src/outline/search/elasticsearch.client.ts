import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export class ElasticsearchError extends Error {
  constructor(message: string, readonly status: number | null, readonly body?: unknown) {
    super(message);
  }
}

/**
 * Client REST tối giản cho Elasticsearch 8 (dùng `fetch` có sẵn của Node, không thêm dependency).
 *
 * Elasticsearch là thành phần TÙY CHỌN: bỏ trống `ELASTICSEARCH_URL` thì `enabled = false`, các nơi gọi tự
 * lùi về tìm kiếm bằng PostgreSQL. Mỗi request có timeout ngắn để ES chậm/tắt không làm treo lượt tư vấn AI.
 */
@Injectable()
export class ElasticsearchClient {
  private readonly logger = new Logger(ElasticsearchClient.name);
  readonly url: string | null;
  readonly index: string;
  private readonly timeoutMs: number;
  private readonly authorization: string | null;

  /** Trong Nest đọc qua ConfigService; script dòng lệnh gọi `new ElasticsearchClient()` thì đọc `process.env`. */
  constructor(@Optional() config?: ConfigService) {
    const read = (key: string) => (config?.get<string>(key) ?? process.env[key])?.trim() || undefined;
    this.url = read('ELASTICSEARCH_URL')?.replace(/\/+$/, '') ?? null;
    this.index = read('ELASTICSEARCH_INDEX') ?? 'bkuni-outlines';
    this.timeoutMs = Number(read('ELASTICSEARCH_TIMEOUT_MS') ?? 3000);
    const user = read('ELASTICSEARCH_USERNAME');
    const password = read('ELASTICSEARCH_PASSWORD');
    this.authorization = user && password ? `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}` : null;
  }

  get enabled(): boolean {
    return this.url !== null;
  }

  async request<T = Record<string, unknown>>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD',
    path: string,
    body?: unknown,
    options: { ndjson?: boolean; timeoutMs?: number; allow404?: boolean } = {},
  ): Promise<T> {
    if (!this.url) throw new ElasticsearchError('Elasticsearch chưa được cấu hình (ELASTICSEARCH_URL)', null);
    const headers: Record<string, string> = { 'Content-Type': options.ndjson ? 'application/x-ndjson' : 'application/json' };
    if (this.authorization) headers.Authorization = this.authorization;
    let response: Response;
    try {
      response = await fetch(`${this.url}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : options.ndjson ? String(body) : JSON.stringify(body),
        signal: AbortSignal.timeout(options.timeoutMs ?? this.timeoutMs),
      });
    } catch (error) {
      throw new ElasticsearchError(`Không kết nối được Elasticsearch: ${(error as Error).message}`, null);
    }
    if (method === 'HEAD') return { ok: response.ok, status: response.status } as T;
    const text = await response.text();
    const json = text ? JSON.parse(text) as Record<string, unknown> : {};
    if (!response.ok && !(options.allow404 && response.status === 404)) {
      const reason = (json.error as { reason?: string } | undefined)?.reason ?? text.slice(0, 300);
      this.logger.warn(`${method} ${path} -> ${response.status}: ${reason}`);
      throw new ElasticsearchError(`Elasticsearch ${response.status}: ${reason}`, response.status, json);
    }
    return json as T;
  }

  /** `true` khi cụm trả lời và không ở trạng thái red. */
  async healthy(): Promise<boolean> {
    if (!this.enabled) return false;
    try {
      const health = await this.request<{ status: string }>('GET', '/_cluster/health', undefined, { timeoutMs: 1500 });
      return health.status !== 'red';
    } catch {
      return false;
    }
  }
}
