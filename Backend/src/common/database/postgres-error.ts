import { QueryFailedError } from 'typeorm';

export const UNIQUE_VIOLATION = '23505';
export const FOREIGN_KEY_VIOLATION = '23503';

function postgresErrorCode(error: unknown): string | undefined {
  const driver = (error as { driverError?: { code?: string } }).driverError;
  const code = driver?.code ?? (error as { code?: string }).code;
  return typeof code === 'string' ? code : undefined;
}

/**
 * Lỗi ràng buộc của PostgreSQL. Driver thật trả `code` (23505, 23503...); một số driver
 * dùng trong test chỉ trả thông điệp, nên khi thiếu mã lỗi thì đối chiếu theo thông điệp.
 */
export function isPostgresError(error: unknown, code: string): boolean {
  if (!(error instanceof QueryFailedError)) return false;
  const actual = postgresErrorCode(error);
  if (actual) return actual === code;
  const message = error.message ?? '';
  if (code === FOREIGN_KEY_VIOLATION) return /violates foreign key constraint/i.test(message);
  if (code === UNIQUE_VIOLATION) return /violates unique constraint|duplicate key value/i.test(message);
  return false;
}
