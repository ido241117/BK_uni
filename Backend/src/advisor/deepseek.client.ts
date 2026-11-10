import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Tin nhắn theo định dạng OpenAI-compatible của DeepSeek. */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  /** Bắt buộc gửi lại ở mọi request sau khi dùng thinking mode cùng `tools`. */
  reasoning_content?: string;
  tool_calls?: ChatToolCall[];
  tool_call_id?: string;
}

export interface ChatToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ChatToolDefinition {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ChatOptions {
  messages: ChatMessage[];
  tools?: ChatToolDefinition[];
  /** Ép model trả JSON (`response_format: json_object`); prompt phải chứa chữ "json". */
  json?: boolean;
  /** Ghi đè cấu hình thinking của môi trường (ví dụ tắt khi chỉ cần định dạng lại JSON). */
  thinking?: boolean;
  maxTokens?: number;
}

export interface ChatResult {
  content: string | null;
  reasoning: string | null;
  toolCalls: ChatToolCall[];
  finishReason: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  cacheHitTokens: number | null;
  durationMs: number;
}

export class DeepSeekError extends Error {}

interface RawResponse {
  choices?: {
    finish_reason?: string | null;
    message?: { content?: string | null; reasoning_content?: string | null; tool_calls?: ChatToolCall[] | null };
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_cache_hit_tokens?: number };
  error?: { message?: string };
}

const REQUEST_TIMEOUT_MS = 150_000;

/** Client tối giản cho Chat Completions của DeepSeek (dùng `fetch` có sẵn của Node). */
@Injectable()
export class DeepSeekClient {
  private readonly logger = new Logger(DeepSeekClient.name);

  constructor(private readonly config: ConfigService) {}

  get isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  get model(): string {
    return this.config.get<string>('DEEPSEEK_MODEL')?.trim() || 'deepseek-flash';
  }

  private get apiKey(): string | undefined {
    return this.config.get<string>('DEEPSEEK_API_KEY')?.trim() || undefined;
  }

  private get baseUrl(): string {
    return (this.config.get<string>('DEEPSEEK_BASE_URL')?.trim() || 'https://api.deepseek.com').replace(/\/+$/, '');
  }

  private get thinkingEnabled(): boolean {
    return (this.config.get<string>('DEEPSEEK_THINKING') ?? 'enabled') !== 'disabled';
  }

  async chat(options: ChatOptions): Promise<ChatResult> {
    if (!this.apiKey) throw new DeepSeekError('Chưa cấu hình DEEPSEEK_API_KEY');
    const thinking = options.thinking ?? this.thinkingEnabled;
    const body: Record<string, unknown> = {
      model: this.model,
      messages: options.messages,
      max_tokens: options.maxTokens ?? 8192,
      stream: false,
      thinking: { type: thinking ? 'enabled' : 'disabled' },
    };
    const effort = this.config.get<string>('DEEPSEEK_REASONING_EFFORT')?.trim();
    if (thinking && effort) body.reasoning_effort = effort;
    if (options.tools?.length) body.tools = options.tools;
    if (options.json) body.response_format = { type: 'json_object' };

    const started = Date.now();
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const reason = error instanceof Error && error.name === 'TimeoutError' ? 'quá thời gian chờ' : String(error);
      throw new DeepSeekError(`Không gọi được DeepSeek: ${reason}`);
    }

    const text = await response.text();
    let raw: RawResponse;
    try {
      raw = JSON.parse(text) as RawResponse;
    } catch {
      throw new DeepSeekError(`DeepSeek trả về dữ liệu không đọc được (HTTP ${response.status})`);
    }
    if (!response.ok) {
      this.logger.warn(`DeepSeek HTTP ${response.status}: ${text.slice(0, 500)}`);
      throw new DeepSeekError(`DeepSeek báo lỗi (HTTP ${response.status}): ${raw.error?.message ?? 'không rõ'}`);
    }

    const choice = raw.choices?.[0];
    if (!choice?.message) throw new DeepSeekError('DeepSeek không trả về câu trả lời');
    return {
      content: choice.message.content ?? null,
      reasoning: choice.message.reasoning_content ?? null,
      toolCalls: choice.message.tool_calls ?? [],
      finishReason: choice.finish_reason ?? null,
      promptTokens: raw.usage?.prompt_tokens ?? null,
      completionTokens: raw.usage?.completion_tokens ?? null,
      cacheHitTokens: raw.usage?.prompt_cache_hit_tokens ?? null,
      durationMs: Date.now() - started,
    };
  }
}
