import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { DataSource, EntityManager, In } from 'typeorm';
import { CourseOutlineImport, type OutlineImportIssue } from './entities/course-outline-import.entity';
import { CourseOutlinePrerequisite } from './entities/course-outline-prerequisite.entity';
import { CourseOutline } from './entities/course-outline.entity';
import { validateDocumentHeader, validateOutline, type OutlineDocument, type ValidOutline } from './outline-format';

export interface OutlineImportResult {
  import_id: string;
  received: number;
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  issues: OutlineImportIssue[];
}

const INSERT_CHUNK = 100;
const MAX_STORED_ISSUES = 200;

const chunks = <T>(list: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(list.length / size) }, (_, index) => list.slice(index * size, (index + 1) * size));

const hashOf = (outline: ValidOutline) => createHash('sha256').update(JSON.stringify(outline.content)).digest('hex');

/**
 * Nhập file `bkuni.course-outlines` vào các bảng đề cương. Dùng chung cho API (Admin) và dòng lệnh.
 *
 * - Khóa của một đề cương là (course_code, version): chưa có thì tạo, có mà nội dung khác thì cập nhật,
 *   giống hệt thì bỏ qua.
 * - Chỉ thêm/cập nhật, KHÔNG xóa đề cương nào vắng mặt trong file, và KHÔNG đụng tới `courses` /
 *   `course_relations`: dữ liệu đề cương và dữ liệu hệ thống luôn còn đủ cả hai để đối chiếu.
 * - Đề cương không hợp lệ bị bỏ qua và ghi vào `issues`; cả file chạy trong một transaction.
 */
@Injectable()
export class OutlineImportService {
  constructor(private readonly dataSource: DataSource) {}

  async importDocument(
    document: OutlineDocument,
    options: { channel: 'api' | 'cli'; userId?: string | null },
  ): Promise<OutlineImportResult> {
    const headerErrors = validateDocumentHeader(document);
    if (headerErrors.length) throw new BadRequestException(headerErrors.join('; '));

    const issues: OutlineImportIssue[] = [];
    const valid = new Map<string, { outline: ValidOutline; hash: string }>();
    document.outlines.forEach((raw, index) => {
      const { outline, errors } = validateOutline(raw);
      const record = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
      const issue = (messages: string[]) => issues.push({
        index,
        course_code: typeof record.course_code === 'string' ? record.course_code : null,
        version: typeof record.version === 'string' ? record.version : null,
        errors: messages,
      });
      if (!outline) {
        issue(errors);
        return;
      }
      const key = `${outline.course_code}@${outline.version}`;
      if (valid.has(key)) {
        issue([`Trùng course_code + version trong cùng file (${key}); giữ bản xuất hiện trước`]);
        return;
      }
      valid.set(key, { outline, hash: hashOf(outline) });
    });

    return this.dataSource.transaction(async manager => {
      const log = await manager.save(manager.create(CourseOutlineImport, {
        created_by: options.userId ?? null,
        channel: options.channel,
        format_version: document.format_version,
        source: typeof document.source === 'string' ? document.source.slice(0, 500) : null,
        generated_at: this.date(document.generated_at),
        part: Number.isInteger(document.part) ? document.part : null,
        parts: Number.isInteger(document.parts) ? document.parts : null,
        received: document.outlines.length,
        created: 0,
        updated: 0,
        unchanged: 0,
        skipped: issues.length,
        issues: issues.slice(0, MAX_STORED_ISSUES),
      }));

      const entries = [...valid.values()];
      const existing = await this.existing(manager, entries.map(entry => entry.outline.course_code));
      const toCreate = entries.filter(entry => !existing.has(`${entry.outline.course_code}@${entry.outline.version}`));
      const toUpdate = entries
        .map(entry => ({ entry, current: existing.get(`${entry.outline.course_code}@${entry.outline.version}`) }))
        .filter((item): item is { entry: typeof entries[number]; current: { id: string; content_hash: string } } => (
          Boolean(item.current) && item.current!.content_hash !== item.entry.hash
        ));

      const row = ({ outline, hash }: typeof entries[number]) => ({
        course_code: outline.course_code,
        version: outline.version,
        applies_from: outline.applies_from,
        source_id: outline.source_id,
        source_code: outline.source_code,
        source_updated_at: outline.source_updated_at,
        name_vi: outline.name_vi,
        name_en: outline.name_en,
        credits: outline.credits,
        level_code: outline.level_code,
        course_type_code: outline.course_type_code,
        faculty_code: outline.faculty_code,
        content: outline.content as object,
        content_hash: hash,
        import_id: log.id,
      });

      const prerequisites: { outline_id: string; type: string | null; type_raw: string | null; related_course_code: string }[] = [];
      for (const part of chunks(toCreate, INSERT_CHUNK)) {
        const result = await manager.insert(CourseOutline, part.map(row));
        part.forEach((entry, index) => {
          const id = result.identifiers[index].id as string;
          entry.outline.prerequisites.forEach(item => prerequisites.push({ ...item, outline_id: id }));
        });
      }
      for (const { entry, current } of toUpdate) {
        await manager.update(CourseOutline, { id: current.id }, row(entry));
        entry.outline.prerequisites.forEach(item => prerequisites.push({ ...item, outline_id: current.id }));
      }
      if (toUpdate.length) {
        for (const ids of chunks(toUpdate.map(item => item.current.id), 1000)) {
          await manager.delete(CourseOutlinePrerequisite, { outline_id: In(ids) });
        }
      }
      for (const part of chunks(prerequisites, 500)) {
        await manager.insert(CourseOutlinePrerequisite, part);
      }

      log.created = toCreate.length;
      log.updated = toUpdate.length;
      log.unchanged = entries.length - toCreate.length - toUpdate.length;
      await manager.save(log);

      return {
        import_id: log.id,
        received: log.received,
        created: log.created,
        updated: log.updated,
        unchanged: log.unchanged,
        skipped: log.skipped,
        issues,
      };
    });
  }

  /** (course_code@version) -> bản đang có, để quyết định tạo/cập nhật/bỏ qua. */
  private async existing(manager: EntityManager, codes: string[]) {
    const result = new Map<string, { id: string; content_hash: string }>();
    for (const part of chunks([...new Set(codes)], 1000)) {
      const rows = await manager.find(CourseOutline, {
        where: { course_code: In(part) },
        select: { id: true, course_code: true, version: true, content_hash: true },
      });
      rows.forEach(item => result.set(`${item.course_code}@${item.version}`, { id: item.id, content_hash: item.content_hash }));
    }
    return result;
  }

  private date(value: unknown): Date | null {
    if (typeof value !== 'string') return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
}
