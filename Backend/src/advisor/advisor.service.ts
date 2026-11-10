import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';
import { StudentProfile } from '../student/entities/student-profile.entity';
import {
  ANSWER_JSON_EXAMPLE,
  ANSWER_SCHEMA,
  normalizeAnswer,
  parseJsonObject,
  type AdvisorAnswer,
  type RawAnswer,
} from './advisor.answer';
import { buildContext, buildSystemPrompt, formatUserMessage, withContext } from './advisor.prompt';
import { AdvisorTools, SUBMIT_ANSWER_TOOL, TOOL_DEFINITIONS, type TurnContext } from './advisor.tools';
import { DeepSeekClient, type ChatMessage, type ChatResult } from './deepseek.client';
import { SendAdvisorMessageDto } from './dto/send-advisor-message.dto';
import { AdvisorSession } from './entities/advisor-session.entity';
import { AdvisorStep } from './entities/advisor-step.entity';
import { currentSemester, nextMainSemester, SEMESTER_CODE } from './semester';

/** Số vòng gọi model tối đa trong một lượt (mỗi vòng có thể gọi nhiều tool). */
const MAX_ROUNDS = 8;
const TOOL_RESULT_LIMIT = 16_000;
const SNAPSHOT_LIMIT = 400_000;

type StepInput = Partial<Omit<AdvisorStep, 'id' | 'session' | 'session_id' | 'turn' | 'seq'>> & Pick<AdvisorStep, 'role'>;

export interface AdvisorTurnResult {
  session: AdvisorSession;
  steps: AdvisorStep[];
}

@Injectable()
export class AdvisorService {
  private readonly logger = new Logger(AdvisorService.name);
  /** Chặn hai lượt chạy song song trên cùng cuộc trò chuyện (thứ tự bước sẽ lẫn lộn). */
  private readonly running = new Set<string>();

  constructor(
    @InjectRepository(AdvisorSession) private readonly sessions: Repository<AdvisorSession>,
    @InjectRepository(AdvisorStep) private readonly steps: Repository<AdvisorStep>,
    @InjectRepository(StudentProfile) private readonly profiles: Repository<StudentProfile>,
    private readonly deepseek: DeepSeekClient,
    private readonly tools: AdvisorTools,
  ) {}

  listSessions(userId: string): Promise<AdvisorSession[]> {
    return this.sessions.find({ where: { user_id: userId }, order: { updated_at: 'DESC' }, take: 50 });
  }

  async getSession(userId: string, id: string): Promise<AdvisorSession & { steps: AdvisorStep[] }> {
    const session = await this.owned(userId, id);
    const steps = await this.steps.find({ where: { session_id: id }, order: { seq: 'ASC' } });
    return { ...session, steps };
  }

  async deleteSession(userId: string, id: string): Promise<null> {
    await this.owned(userId, id);
    if (this.running.has(id)) throw new ConflictException('Cuộc trò chuyện đang được trả lời, thử lại sau');
    await this.sessions.delete({ id });
    return null;
  }

  async sendMessage(userId: string, dto: SendAdvisorMessageDto): Promise<AdvisorTurnResult> {
    if (!this.deepseek.isConfigured) {
      throw new ServiceUnavailableException('Backend chưa cấu hình DEEPSEEK_API_KEY nên chưa dùng được Tư vấn với AI');
    }
    const profile = await this.profiles.findOne({ where: { user_id: userId } });
    if (!profile?.curriculum_id) throw new BadRequestException('Hãy chọn chương trình đào tạo trong hồ sơ trước');

    let session = dto.session_id ? await this.owned(userId, dto.session_id, true) : null;
    const snapshot = dto.snapshot ?? session?.snapshot ?? null;
    if (!snapshot) throw new BadRequestException('Thiếu dữ liệu phân tích học tập (snapshot)');
    if (JSON.stringify(snapshot).length > SNAPSHOT_LIMIT) throw new BadRequestException('Dữ liệu phân tích quá lớn');

    if (!session) {
      session = await this.sessions.save(this.sessions.create({
        user_id: userId,
        title: dto.message.trim().slice(0, 80) || 'Cuộc trò chuyện mới',
        model: this.deepseek.model,
        snapshot: null,
        snapshot_hash: null,
      }));
    }
    if (this.running.has(session.id)) throw new ConflictException('AI đang trả lời tin nhắn trước, hãy đợi một chút');
    this.running.add(session.id);
    try {
      return await this.runTurn(session, profile.curriculum_id, snapshot, dto, userId);
    } finally {
      this.running.delete(session.id);
    }
  }

  /* ------------------------------- Một lượt ------------------------------- */

  private async runTurn(
    session: AdvisorSession,
    curriculumId: string,
    snapshot: Record<string, unknown>,
    dto: SendAdvisorMessageDto,
    userId: string,
  ): Promise<AdvisorTurnResult> {
    const previous = await this.steps.find({ where: { session_id: session.id }, order: { seq: 'ASC' } });
    let seq = previous.at(-1)?.seq ?? 0;
    const turn = (previous.at(-1)?.turn ?? 0) + 1;
    const created: AdvisorStep[] = [];
    const record = async (input: StepInput): Promise<AdvisorStep> => {
      seq += 1;
      const step = await this.steps.save(this.steps.create({ ...input, session_id: session.id, turn, seq }));
      created.push(step);
      return step;
    };

    const messages = this.replay(previous);
    if (!previous.some(step => step.role === 'system')) {
      const system = buildSystemPrompt(new Date());
      await record({ role: 'system', content: system });
      messages.unshift({ role: 'system', content: system });
    }

    // Context chỉ gửi lại khi dữ liệu phân tích đổi so với lần trước (model vẫn nhớ bản cũ trong lịch sử).
    const hash = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
    let context: string | null = null;
    if (hash !== session.snapshot_hash) {
      context = buildContext(snapshot);
      await record({ role: 'context', content: context, data: { snapshot_hash: hash, bytes: JSON.stringify(snapshot).length } });
    }
    const userContent = formatUserMessage(dto);
    await record({ role: 'user', content: userContent, data: dto.answers?.length ? { answers: dto.answers } : null });
    this.pushUser(messages, withContext(context, userContent));

    session.snapshot = snapshot;
    session.snapshot_hash = hash;
    session.updated_at = new Date();
    await this.sessions.save(session);

    const next = typeof snapshot.next === 'string' && SEMESTER_CODE.test(snapshot.next)
      ? snapshot.next
      : nextMainSemester(currentSemester());
    const ctx: TurnContext = { userId, curriculumId, snapshot, nextSemester: next };

    try {
      const answer = await this.agentLoop(messages, ctx, record, userContent, created);
      await record({ role: 'answer', content: answer.message, data: answer });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Advisor turn failed (${session.id}): ${message}`);
      await record({ role: 'error', content: message });
    }

    return { session: await this.owned(userId, session.id), steps: created };
  }

  private async agentLoop(
    messages: ChatMessage[],
    ctx: TurnContext,
    record: (input: StepInput) => Promise<AdvisorStep>,
    userContent: string,
    created: AdvisorStep[],
  ): Promise<AdvisorAnswer> {
    let rejectedOnce = false;
    let draft: string | null = null;

    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      const result = await this.deepseek.chat({ messages, tools: TOOL_DEFINITIONS });
      await record({
        role: 'assistant',
        content: result.content,
        reasoning: result.reasoning,
        tool_calls: result.toolCalls.length
          ? result.toolCalls.map(call => ({ id: call.id, name: call.function.name, arguments: call.function.arguments }))
          : null,
        ...this.usage(result),
        data: { finish_reason: result.finishReason },
      });
      messages.push(this.assistantMessage(result.content, result.reasoning, result.toolCalls));

      if (!result.toolCalls.length) {
        // Model trả lời bằng văn bản thay vì gọi submit_answer: định dạng lại bằng JSON mode.
        draft = result.content;
        break;
      }

      let final: AdvisorAnswer | null = null;
      for (const call of result.toolCalls) {
        const name = call.function.name;
        const args = parseJsonObject(call.function.arguments);
        const started = Date.now();
        let output: unknown;

        if (name === SUBMIT_ANSWER_TOOL) {
          const checked = await this.checkAnswer(args, ctx, rejectedOnce);
          if (checked.answer) {
            final = { ...checked.answer, source: 'tool' };
            output = { ok: true };
          } else {
            rejectedOnce = true;
            output = { ok: false, errors: checked.errors, hint: `Sửa các lỗi trên rồi gọi lại ${SUBMIT_ANSWER_TOOL}.` };
          }
        } else if (!args) {
          output = { error: 'Tham số không phải JSON hợp lệ' };
        } else {
          try {
            output = await this.tools.execute(name, args, ctx);
          } catch (error) {
            this.logger.warn(`Tool ${name} failed: ${error instanceof Error ? error.stack : String(error)}`);
            output = { error: 'Lỗi khi truy vấn dữ liệu' };
          }
        }

        const content = this.truncate(JSON.stringify(output));
        await record({
          role: 'tool',
          tool_call_id: call.id,
          tool_name: name,
          tool_args: args ?? call.function.arguments,
          content,
          data: output,
          duration_ms: Date.now() - started,
        });
        messages.push({ role: 'tool', tool_call_id: call.id, content });
      }
      if (final) return final;
    }

    return this.formatWithJsonMode(draft, userContent, ctx, record, created);
  }

  /**
   * Kiểm tra tham số submit_answer. Lần đầu có lỗi thì trả lỗi cho model sửa; lần sau chấp nhận phần hợp lệ
   * và ghi chú phần đã bỏ, để một lỗi nhỏ không làm hỏng cả lượt.
   */
  private async checkAnswer(
    args: Record<string, unknown> | null,
    ctx: TurnContext,
    lenient: boolean,
  ): Promise<{ answer: Omit<AdvisorAnswer, 'source'> | null; errors: string[] }> {
    const { answer, errors } = normalizeAnswer(args);
    if (!answer) return { answer: null, errors };
    const enriched = await this.tools.enrichAnswer(answer, ctx);
    if (enriched.unknown.length) errors.push(`Mã môn không tồn tại: ${enriched.unknown.join(', ')}. Chỉ dùng mã lấy từ context/tool.`);
    if (errors.length && !lenient) return { answer: null, errors };
    return {
      answer: {
        ...answer,
        recommendations: enriched.recommendations,
        notes: errors.length ? [`Backend đã bỏ phần không hợp lệ: ${errors.join(' ')}`] : [],
      },
      errors,
    };
  }

  /** Dự phòng: ép JSON bằng `response_format: json_object` dựa trên bản nháp và kết quả tool của lượt. */
  private async formatWithJsonMode(
    draft: string | null,
    userContent: string,
    ctx: TurnContext,
    record: (input: StepInput) => Promise<AdvisorStep>,
    created: AdvisorStep[],
  ): Promise<AdvisorAnswer> {
    const evidence = created
      .filter(step => step.role === 'tool' && step.tool_name !== SUBMIT_ANSWER_TOOL)
      .map(step => `${step.tool_name} ${JSON.stringify(step.tool_args)}:\n${(step.content ?? '').slice(0, 3000)}`)
      .join('\n\n')
      .slice(0, 24_000);
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content:
          'Bạn chuyển câu trả lời tư vấn học tập thành đúng một JSON object (json) theo schema sau, tiếng Việt, ' +
          `chỉ dùng mã môn xuất hiện trong dữ liệu:\n${JSON.stringify(ANSWER_SCHEMA)}\n\nVí dụ json:\n${ANSWER_JSON_EXAMPLE}`,
      },
      {
        role: 'user',
        content:
          `Câu hỏi của sinh viên:\n${userContent}\n\nDữ liệu đã tra cứu:\n${evidence || '(không có)'}\n\n` +
          `Bản nháp câu trả lời:\n${draft?.trim() || '(không có, hãy tự viết câu trả lời ngắn dựa trên dữ liệu)'}`,
      },
    ];

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await this.deepseek.chat({ messages, json: true, thinking: false, maxTokens: 4096 });
      await record({
        role: 'assistant',
        content: result.content,
        reasoning: result.reasoning,
        ...this.usage(result),
        // Bước định dạng không thuộc hội thoại chính nên không gửi lại cho model ở lượt sau.
        data: { finish_reason: result.finishReason, formatter: true, attempt: attempt + 1 },
      });
      const checked = await this.checkAnswer(parseJsonObject(result.content), ctx, true);
      if (checked.answer) return { ...checked.answer, source: 'json_mode' };
    }

    const fallback: RawAnswer = {
      message: draft?.trim() || 'Xin lỗi, mình chưa tạo được câu trả lời. Bạn thử hỏi lại nhé.',
      recommendations: [],
      choices: [],
      suggestions: [],
    };
    return { ...fallback, recommendations: [], notes: ['Không định dạng được câu trả lời thành JSON.'], source: 'json_mode' };
  }

  /* ------------------------------- Lịch sử ------------------------------- */

  /**
   * Dựng lại danh sách tin nhắn cho model từ các bước đã lưu. Giữ nguyên `reasoning_content`
   * (DeepSeek bắt buộc khi dùng thinking + tools) và bù kết quả cho tool call bị gián đoạn.
   */
  private replay(steps: AdvisorStep[]): ChatMessage[] {
    const messages: ChatMessage[] = [];
    let context: string | null = null;
    let pendingCalls: string[] = [];
    const closePending = () => {
      pendingCalls.forEach(id => messages.push({ role: 'tool', tool_call_id: id, content: JSON.stringify({ error: 'Bị gián đoạn' }) }));
      pendingCalls = [];
    };

    for (const step of steps) {
      if (step.role === 'tool') {
        if (!step.tool_call_id || !pendingCalls.includes(step.tool_call_id)) continue;
        pendingCalls = pendingCalls.filter(id => id !== step.tool_call_id);
        messages.push({ role: 'tool', tool_call_id: step.tool_call_id, content: step.content ?? '' });
        continue;
      }
      if (['system', 'context', 'user', 'assistant'].includes(step.role)) closePending();

      if (step.role === 'system') messages.push({ role: 'system', content: step.content ?? '' });
      if (step.role === 'context') context = step.content;
      if (step.role === 'user') {
        this.pushUser(messages, withContext(context, step.content ?? ''));
        context = null;
      }
      if (step.role === 'assistant') {
        if ((step.data as { formatter?: boolean } | null)?.formatter) continue;
        const calls = (step.tool_calls ?? []).map(call => ({
          id: call.id,
          type: 'function' as const,
          function: { name: call.name, arguments: call.arguments },
        }));
        messages.push(this.assistantMessage(step.content, step.reasoning, calls));
        pendingCalls = calls.map(call => call.id);
      }
    }
    closePending();
    return messages;
  }

  /** Hai tin nhắn `user` liền nhau (lượt trước lỗi) được gộp lại. */
  private pushUser(messages: ChatMessage[], content: string) {
    const last = messages.at(-1);
    if (last?.role === 'user') last.content = `${last.content ?? ''}\n\n${content}`;
    else messages.push({ role: 'user', content });
  }

  private assistantMessage(content: string | null, reasoning: string | null, toolCalls: ChatResult['toolCalls']): ChatMessage {
    const message: ChatMessage = { role: 'assistant', content: content ?? '' };
    if (reasoning) message.reasoning_content = reasoning;
    if (toolCalls.length) message.tool_calls = toolCalls;
    return message;
  }

  private usage(result: ChatResult) {
    return {
      prompt_tokens: result.promptTokens,
      completion_tokens: result.completionTokens,
      cache_hit_tokens: result.cacheHitTokens,
      duration_ms: result.durationMs,
    };
  }

  private truncate(text: string): string {
    return text.length > TOOL_RESULT_LIMIT ? `${text.slice(0, TOOL_RESULT_LIMIT)}…(đã cắt bớt)` : text;
  }

  private async owned(userId: string, id: string, withSnapshot = false): Promise<AdvisorSession> {
    const query = this.sessions.createQueryBuilder('s').where('s.id = :id AND s.user_id = :userId', { id, userId });
    if (withSnapshot) query.addSelect('s.snapshot');
    const session = await query.getOne();
    if (!session) throw new NotFoundException('Không tìm thấy cuộc trò chuyện');
    return session;
  }
}
