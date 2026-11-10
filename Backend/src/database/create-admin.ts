import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { ROLE } from '../user/enum/role';
import { User } from '../user/entities/user.entity';
import { getDatabaseOptions } from './database-options';
import { entities } from './entities';

const DEFAULT_EMAIL = 'admin@bkuni.local';
const DEFAULT_PASSWORD = 'Admin@123456';

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.find((value) => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

/**
 * Tạo (hoặc nâng quyền) một tài khoản Admin. Backend không có API tự cấp Admin, nên việc này
 * do người vận hành chạy trực tiếp trên database:
 *
 *   npm run admin:create
 *   npm run admin:create -- --email=admin@example.com --password=MatKhau123
 */
async function main(): Promise<void> {
  const email = (arg('email') ?? DEFAULT_EMAIL).trim().toLowerCase();
  const password = arg('password') ?? DEFAULT_PASSWORD;

  if (Buffer.byteLength(password, 'utf8') < 8 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('Mật khẩu phải từ 8 đến 72 byte UTF-8.');
  }

  const dataSource = new DataSource({
    ...getDatabaseOptions(process.env as Record<string, unknown>),
    entities,
    synchronize: false,
    migrations: [],
  });
  await dataSource.initialize();

  const users = dataSource.getRepository(User);
  const hash = await bcrypt.hash(password, 10);
  const existing = await users.createQueryBuilder('user')
    .addSelect('user.password')
    .where('LOWER(user.email) = LOWER(:email)', { email })
    .getOne();

  if (existing) {
    existing.password = hash;
    existing.role = ROLE.ADMIN;
    await users.save(existing);
    console.log(`Đã cập nhật quyền ADMIN cho tài khoản có sẵn: ${email} (id: ${existing.id})`);
  } else {
    const created = await users.save(users.create({ email, password: hash, role: ROLE.ADMIN }));
    console.log(`Đã tạo tài khoản ADMIN: ${email} (id: ${created.id})`);
  }

  console.log('Mật khẩu: giá trị bạn vừa đặt (mặc định là Admin@123456).');
  await dataSource.destroy();
}

main().catch((error: unknown) => {
  console.error('TẠO ADMIN THẤT BẠI:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
